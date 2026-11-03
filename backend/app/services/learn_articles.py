"""Yahoo personal-finance RSS discovery. No scraping, credentials or client-selected URLs."""
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from threading import Lock
from time import monotonic
from urllib.parse import urlsplit, parse_qs
import re

import requests
from defusedxml import ElementTree
from defusedxml.common import DefusedXmlException
from xml.etree.ElementTree import ParseError


MAX_FEED_BYTES = 1024 * 1024
CACHE_SECONDS = 15 * 60
RETRY_SECONDS = 60
MAX_STALE_SECONDS = 24 * 60 * 60


def is_yahoo_url(value, feed=False):
    try:
        parsed = urlsplit(value)
        if parsed.scheme != 'https' or parsed.port not in (None, 443) or parsed.username or parsed.password:
            return False
        if feed:
            if parsed.hostname == 'news.google.com':
                query = parse_qs(parsed.query).get('q', [''])[0]
                return parsed.path == '/rss/search' and 'site:finance.yahoo.com/personal-finance' in query
            return parsed.hostname in {'finance.yahoo.com', 'feeds.finance.yahoo.com'}
        return parsed.hostname == 'finance.yahoo.com'
    except (ValueError, TypeError):
        return False


def is_discovery_link(value):
    try:
        parsed = urlsplit(value)
        return (
            parsed.scheme == 'https' and parsed.hostname == 'news.google.com'
            and parsed.port in (None, 443) and not parsed.username and not parsed.password
            and parsed.path.startswith(('/rss/articles/', '/articles/'))
        )
    except (ValueError, TypeError):
        return False


def learning_topic(title):
    # Select consumer money skills, not stock recommendations or company earnings.
    if re.search(r'\b(stock|stocks|shares|earnings|ipo|nasdaq|dividend|dividends)\b', title, re.I):
        return None
    if re.search(r'\b(review|reviews|bonus|bonuses|rates today|interest rates today|earn up to)\b|\bbest\b.*\b(accounts|cards|loans|rates)\b', title, re.I):
        return None
    for topic, pattern in [
        ('Staying safe', r'\b(scam|scams|fraud|phishing|identity theft)\b'),
        ('Budgeting', r'\b(budget|budgets|budgeting|spending|expenses|paycheck)\b'),
        ('Saving', r'\b(saving|savings|save money|emergency fund|emergency funds)\b'),
        ('Debt and credit', r'\b(debt|debts|credit card|credit score|borrowing|loan|loans)\b'),
    ]:
        if re.search(pattern, title, re.I):
            return topic
    return None


def parse_articles(content, discovery=False):
    if len(content) > MAX_FEED_BYTES:
        raise ValueError('Feed exceeds size limit')
    root = ElementTree.fromstring(content)
    if root.tag != 'rss' or root.find('channel') is None:
        raise ValueError('Expected an RSS feed')
    articles, seen = [], set()
    for item in root.findall('./channel/item'):
        title = (item.findtext('title') or '').strip()
        url = (item.findtext('link') or '').strip()
        source = item.find('source')
        if discovery:
            if source is None or source.get('url', '').rstrip('/') != 'https://finance.yahoo.com' or (source.text or '').strip().casefold() != 'yahoo finance':
                continue
            if not is_discovery_link(url):
                continue
        elif not is_yahoo_url(url):
            continue
        topic = learning_topic(title)
        if not title or len(title) > 500 or not topic or url in seen:
            continue
        published = None
        try:
            date = parsedate_to_datetime(item.findtext('pubDate') or '')
            if date.tzinfo is not None:
                published = date.astimezone(timezone.utc).isoformat()
        except (ValueError, TypeError, OverflowError):
            pass
        article = {'title': title, 'url': url, 'publishedAt': published, 'topic': topic, 'via': 'Google News' if discovery else 'Yahoo Finance'}
        articles.append(article)
        seen.add(url)
    articles.sort(key=lambda article: article['publishedAt'] or '', reverse=True)
    return articles[:12]


class YahooArticleFeed:
    def __init__(self):
        self._lock = Lock()
        self._url = None
        self._articles = None
        self._fetched_at = None
        self._last_success = None
        self._next_attempt = 0
        self._failed = False

    def load(self, url):
        with self._lock:
            now = monotonic()
            if url != self._url:
                self._url = url
                self._articles = self._last_success = self._fetched_at = None
                self._next_attempt = 0
            if not url or not is_yahoo_url(url, feed=True):
                return self._response('unavailable')
            if now >= self._next_attempt:
                try:
                    content = bytearray()
                    with requests.get(
                        url, timeout=(3, 5), stream=True, allow_redirects=False,
                        headers={'User-Agent': 'SmartMoneyEasy/0.1 RSS reader', 'Accept': 'application/rss+xml, application/xml, text/xml'},
                    ) as response:
                        if response.status_code != 200:
                            raise ValueError('Feed is unavailable')
                        for chunk in response.iter_content(16384):
                            content.extend(chunk)
                            if len(content) > MAX_FEED_BYTES:
                                raise ValueError('Feed exceeds size limit')
                            if monotonic() - now > 8:
                                raise ValueError('Feed read timed out')
                    self._articles = parse_articles(bytes(content), discovery=urlsplit(url).hostname == 'news.google.com')
                    self._last_success = monotonic()
                    self._fetched_at = datetime.now(timezone.utc).isoformat()
                    self._next_attempt = self._last_success + CACHE_SECONDS
                    self._failed = False
                except (requests.RequestException, ValueError, ParseError, DefusedXmlException):
                    self._next_attempt = monotonic() + RETRY_SECONDS
                    self._failed = True
            if self._last_success is None or monotonic() - self._last_success > MAX_STALE_SECONDS:
                return self._response('unavailable')
            return self._response('stale' if self._failed else 'available')

    def _response(self, status):
        return {
            'articles': self._articles if status != 'unavailable' else [],
            'status': status,
            'fetchedAt': self._fetched_at if status != 'unavailable' else None,
            'source': 'Yahoo Finance',
            'discoverySource': 'Google News' if self._url and urlsplit(self._url).hostname == 'news.google.com' else None,
            'sourceUrl': 'https://finance.yahoo.com/personal-finance/',
        }
