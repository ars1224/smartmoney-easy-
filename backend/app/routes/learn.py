from flask import Blueprint, current_app, jsonify
from app.auth_security import get_authenticated_user_id
from app.services.learn_articles import YahooArticleFeed

learn_bp = Blueprint('learn', __name__, url_prefix='/api/learn')


@learn_bp.get('/articles')
def get_articles():
    if not get_authenticated_user_id():
        return jsonify({'error': 'Authentication required.'}), 401
    feed = current_app.extensions.setdefault('learn_yahoo_feed', YahooArticleFeed())
    response = jsonify(feed.load(current_app.config.get('YAHOO_FINANCE_RSS_URL', '')))
    response.headers['Cache-Control'] = 'private, no-store'
    return response
