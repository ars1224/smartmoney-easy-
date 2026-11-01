"""Run with python -m unittest discover -s tests -p test_learn_articles.py.

Uses mocked HTTP and signed test sessions; no database writes or external calls.
"""
import unittest
from unittest.mock import Mock, patch
from app import create_app
from app.services.learn_articles import YahooArticleFeed, parse_articles, is_yahoo_url, is_discovery_link, learning_topic

RSS = b'''<rss version="2.0"><channel>
<item><title>Build a savings habit &amp; make a plan</title><link>https://finance.yahoo.com/news/saving.html</link><pubDate>Tue, 27 Oct 2026 01:00:00 GMT</pubDate></item>
<item><title>Duplicate</title><link>https://finance.yahoo.com/news/saving.html</link></item>
<item><title>Unsafe</title><link>javascript:alert(1)</link></item>
<item><title>Other publisher</title><link>https://example.com/story</link></item>
<item><title>Unexpected credentials</title><link>https://user:pass@finance.yahoo.com/story</link></item>
<item><title>Missing title</title><link></link></item>
</channel></rss>'''


def response(content=RSS, status=200):
    value = Mock(status_code=status)
    value.iter_content.return_value = [content]
    value.__enter__ = Mock(return_value=value)
    value.__exit__ = Mock(return_value=False)
    return value


class LearnArticleTests(unittest.TestCase):
    def test_parser_preserves_headlines_and_rejects_unsafe_or_duplicate_links(self):
        articles = parse_articles(RSS)
        self.assertEqual(len(articles), 1)
        self.assertEqual(articles[0]['title'], 'Build a savings habit & make a plan')
        self.assertEqual(articles[0]['publishedAt'], '2026-10-27T01:00:00+00:00')
        self.assertFalse(is_yahoo_url('https://finance.yahoo.com.evil.test/feed', True))
        self.assertFalse(is_yahoo_url('http://finance.yahoo.com/feed', True))
        self.assertFalse(is_yahoo_url('https://finance.yahoo.com:444/feed', True))

    def test_accepts_current_yahoo_market_article_paths(self):
        self.assertTrue(is_yahoo_url("https://finance.yahoo.com/markets/stocks/articles/example-123.html?.tsrc=rss"))

    def test_discovery_requires_yahoo_source_and_relevant_topics(self):
        content = b'''<rss><channel>
        <item><title>How to build an emergency fund - Yahoo Finance</title><link>https://news.google.com/rss/articles/saving</link><source url="https://finance.yahoo.com">Yahoo Finance</source><pubDate>Tue, 27 Oct 2026 01:00:00 GMT</pubDate></item>
        <item><title>Credit card debt explained - Yahoo Finance</title><link>https://news.google.com/rss/articles/debt</link><source url="https://finance.yahoo.com">Yahoo Finance</source><pubDate>Mon, 26 Oct 2026 01:00:00 GMT</pubDate></item>
        <item><title>Savings stocks soar</title><link>https://news.google.com/rss/articles/stocks</link><source url="https://finance.yahoo.com">Yahoo Finance</source></item>
        <item><title>Build a savings habit</title><link>https://news.google.com/rss/articles/other</link><source url="https://example.com">Other publisher</source></item>
        <item><title>Budget guide</title><link>https://example.com/unsafe</link><source url="https://finance.yahoo.com">Yahoo Finance</source></item>
        <item><title>Budget guide missing source</title><link>https://news.google.com/rss/articles/missing</link></item>
        </channel></rss>'''
        articles = parse_articles(content, discovery=True)
        self.assertEqual([a['topic'] for a in articles], ['Saving', 'Debt and credit'])
        self.assertTrue(all(a['via'] == 'Google News' for a in articles))
        self.assertFalse(is_discovery_link('https://news.google.com/search?q=savings'))
        self.assertFalse(is_discovery_link('https://news.google.com.evil.test/rss/articles/a'))
        self.assertFalse(is_yahoo_url('https://news.google.com/rss/search?q=stocks', feed=True))
        self.assertIsNone(learning_topic('Bank earnings and share price targets'))
        self.assertIsNone(learning_topic('Best high-yield savings rates today'))
        self.assertIsNone(learning_topic('Sallie Mae Bank review: savings accounts'))
        self.assertEqual(learning_topic('How to avoid a phishing scam'), 'Staying safe')

    def test_rejects_entities_and_oversize_content(self):
        with self.assertRaises(Exception):
            parse_articles(b'<!DOCTYPE rss [<!ENTITY x "unsafe">]><rss><channel><item><title>&x;</title></item></channel></rss>')
        with self.assertRaises(ValueError):
            parse_articles(b'x' * (1024 * 1024 + 1))

    @patch('app.services.learn_articles.requests.get')
    def test_cache_and_stale_fallback(self, get):
        get.return_value = response()
        feed = YahooArticleFeed()
        first = feed.load('https://feeds.finance.yahoo.com/rss/2.0/headline?s=%5EGSPC&region=US&lang=en-US')
        self.assertEqual(first['status'], 'available')
        self.assertEqual(feed.load('https://feeds.finance.yahoo.com/rss/2.0/headline?s=%5EGSPC&region=US&lang=en-US'), first)
        get.assert_called_once()
        feed._next_attempt = 0
        get.return_value = response(status=429)
        self.assertEqual(feed.load('https://feeds.finance.yahoo.com/rss/2.0/headline?s=%5EGSPC&region=US&lang=en-US')['status'], 'stale')
        self.assertEqual(get.call_count, 2)
        feed.load('https://feeds.finance.yahoo.com/rss/2.0/headline?s=%5EGSPC&region=US&lang=en-US')
        self.assertEqual(get.call_count, 2)

    @patch('app.services.learn_articles.requests.get')
    def test_missing_feed_and_upstream_error_are_honest(self, get):
        feed = YahooArticleFeed()
        self.assertEqual(feed.load('')['status'], 'unavailable')
        self.assertEqual(feed.load('https://example.com/feed')['status'], 'unavailable')
        get.assert_not_called()
        get.return_value = response(b'<not-xml')
        self.assertEqual(feed.load('https://feeds.finance.yahoo.com/rss/2.0/headline?s=%5EGSPC&region=US&lang=en-US')['articles'], [])

    @patch('app.services.learn_articles.requests.get')
    def test_route_requires_session_and_does_not_accept_query_url(self, get):
        app = create_app()
        app.config.update(TESTING=True, YAHOO_FINANCE_RSS_URL='')
        with app.test_client() as client:
            self.assertEqual(client.get('/api/learn/articles').status_code, 401)
            with client.session_transaction() as session:
                session['user_id'] = 'isolated-learn-test'
            result = client.get('/api/learn/articles?url=https://example.com/feed')
            self.assertEqual(result.status_code, 200)
            self.assertEqual(result.get_json()['status'], 'unavailable')
            self.assertEqual(result.headers['Cache-Control'], 'private, no-store')
        get.assert_not_called()


if __name__ == '__main__':
    unittest.main()
