import unittest
from unittest.mock import patch
from config import Config
from app import create_app

class ThinkerTests(unittest.TestCase):
 def setUp(self):
  with patch.object(Config, "SQLALCHEMY_DATABASE_URI", "sqlite:///:memory:"), patch.object(Config, "SECRET_KEY", "thinker-test-only"):
   self.app = create_app()
  self.app.config.update(THINKER_MODE="demo", OPENAI_API_KEY="")
  self.client = self.app.test_client()
  with self.client.session_transaction() as session:
   session["user_id"] = "test-owner"; session["csrf_token"] = "test-csrf"
 def send(self, message):
  return self.client.post('/api/thinker/messages', json={"message": message}, headers={"X-CSRF-Token": "test-csrf"})
 def test_topics_are_explicit_demo_and_do_not_echo_personal_input(self):
  for question, title in [("budget", "Build a simple budget"), ("saving", "Plan a savings goal"), ("spending", "Understand your spending")]:
   reply = self.send(question)
   self.assertEqual(reply.status_code, 200)
   self.assertEqual(reply.json['mode'], 'demo')
   self.assertEqual(reply.json['title'], title)
   self.assertTrue(reply.json['takeaway'])
   self.assertIn('no-store', reply.headers['Cache-Control'])
  reply = self.send('my secret account is 12345')
  self.assertNotIn('12345', reply.get_data(as_text=True))
  self.assertIn('cannot answer', reply.json['message'])
 def test_requires_session_and_csrf(self):
  self.assertEqual(self.client.post('/api/thinker/messages',json={"message":"budget"}).status_code,403)
  with self.client.session_transaction() as session: session.pop('user_id')
  self.assertEqual(self.send('budget').status_code,401)
 def test_rejects_invalid_messages(self):
  for value in ['', '   ', None, {}, 123, 'x'*601]:
   self.assertEqual(self.send(value).status_code,400)
  self.assertEqual(self.client.post('/api/thinker/messages',json=[],headers={"X-CSRF-Token":"test-csrf"}).status_code,400)
  self.assertEqual(self.send('x'*9000).status_code,413)
 def test_live_mode_is_unavailable_not_paid_fallback(self):
  self.app.config['THINKER_MODE']='live'
  self.assertEqual(self.send('budget').status_code,503)
