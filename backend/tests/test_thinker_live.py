from contextlib import closing
import sqlite3
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import Mock, patch
import requests
from config import Config
from app import create_app
from app.services.thinker import ThinkerError, get_reply, reserve_request

class ThinkerLiveTests(unittest.TestCase):
 def setUp(self):
  self.temp = tempfile.TemporaryDirectory()
  with patch.object(Config, 'SQLALCHEMY_DATABASE_URI', 'sqlite:///:memory:'), patch.object(Config, 'SECRET_KEY', 'test-only'):
   self.app = create_app()
  self.app.config.update(THINKER_MODE='live',OPENAI_API_KEY='unit-test-placeholder',OPENAI_MODEL='gpt-5.4-mini',THINKER_LIMIT_DB=str(Path(self.temp.name)/'limits.sqlite'))
  self.client=self.app.test_client()
  with self.client.session_transaction() as session: session.update(user_id='owner',csrf_token='csrf')
 def tearDown(self): self.temp.cleanup()
 def send(self,text='What is a budget?'):
  return self.client.post('/api/thinker/messages',json={'message':text},headers={'X-CSRF-Token':'csrf'})
 def response(self, **changes):
  data={'status':'completed','output':[{'type':'message','role':'assistant','content':[{'type':'output_text','text':'Review your bills.'}]}]};data.update(changes)
  return Mock(status_code=200,json=Mock(return_value=data))
 @patch('app.services.thinker.requests.post')
 def test_live_request_is_minimal_bounded_and_not_stored(self,post):
  post.return_value=self.response(); result=self.send()
  self.assertEqual(result.status_code,200); self.assertEqual(result.json['mode'],'live')
  kwargs=post.call_args.kwargs; payload=kwargs['json']
  self.assertEqual(payload['input'],'What is a budget?');self.assertFalse(payload['store'])
  self.assertEqual(payload['max_output_tokens'],400);self.assertEqual(payload['reasoning'],{'effort':'none'})
  self.assertNotIn('user',payload);self.assertNotIn('previous_response_id',payload);self.assertNotIn('tools',payload)
  self.assertFalse(kwargs['allow_redirects']);self.assertEqual(kwargs['timeout'],(3,18))
  self.assertIn('no-store',result.headers['Cache-Control'])
  self.assertNotIn('unit-test-placeholder',result.get_data(as_text=True))
 @patch('app.services.thinker.requests.post')
 def test_rejected_requests_never_call_provider(self,post):
  self.assertEqual(self.send('x'*601).status_code,400)
  self.app.config['OPENAI_API_KEY']=''; self.assertEqual(self.send().status_code,503)
  self.app.config.update(OPENAI_API_KEY='placeholder',OPENAI_MODEL='unapproved-model');self.assertEqual(self.send().status_code,503)
  post.assert_not_called()
 @patch('app.services.thinker.requests.post')
 def test_provider_errors_sanitised_without_automatic_retry(self,post):
  for status in [401,403,429,500]:
   post.return_value=Mock(status_code=status,text='SECRET provider error');post.reset_mock()
   with self.assertRaises(ThinkerError) as error:get_reply(self.app.config,'budget')
   self.assertEqual(error.exception.status,429 if status==429 else 503)
   self.assertNotIn('SECRET',str(error.exception));post.assert_called_once()
 @patch('app.services.thinker.requests.post')
 def test_timeout_invalid_empty_incomplete(self,post):
  post.side_effect=requests.Timeout()
  with self.assertRaises(ThinkerError) as error:get_reply(self.app.config,'budget')
  self.assertEqual(error.exception.status,504);post.side_effect=None
  for result in [self.response(output=[]),self.response(status='incomplete'),Mock(status_code=200,json=Mock(side_effect=ValueError()))]:
   post.return_value=result
   with self.assertRaises(ThinkerError):get_reply(self.app.config,'budget')
 def test_status_authenticated_without_key(self):
  result=self.client.get('/api/thinker/status');self.assertEqual(result.json,{'mode':'live','available':True})
  self.assertNotIn('unit-test-placeholder',result.get_data(as_text=True))
  with self.client.session_transaction() as session:session.clear()
  self.assertEqual(self.client.get('/api/thinker/status').status_code,401)
 def test_persistent_user_and_shared_limits(self):
  self.app.config.update(THINKER_USER_DAILY_LIMIT=2,THINKER_USER_MINUTE_LIMIT=1,THINKER_DAILY_LIMIT=3)
  reserve_request(self.app,'a',1000)
  with self.assertRaises(ThinkerError):reserve_request(self.app,'a',1001)
  reserve_request(self.app,'a',1061)
  with self.assertRaises(ThinkerError):reserve_request(self.app,'a',1122)
  reserve_request(self.app,'b',1122)
  with self.assertRaises(ThinkerError):reserve_request(self.app,'c',1122)
  reserve_request(self.app,'a',86401)
  with closing(sqlite3.connect(self.app.config['THINKER_LIMIT_DB'])) as db:
   self.assertEqual([row[1] for row in db.execute('pragma table_info(attempts)')],['user_id','created'])
 def test_concurrent_workers_share_atomic_limit(self):
  self.app.config['THINKER_DAILY_LIMIT']=1;reserve_request(self.app,'old',1)
  def attempt(user):
   try:reserve_request(self.app,user,86401);return True
   except ThinkerError:return False
  with ThreadPoolExecutor(max_workers=4) as pool:results=list(pool.map(attempt,['a','b','c','d']))
  self.assertEqual(sum(results),1)
 @patch('app.services.thinker.requests.post')
 def test_failed_attempts_count_and_limit_blocks_provider(self,post):
  self.app.config['THINKER_DAILY_LIMIT']=1;post.side_effect=requests.Timeout()
  self.assertEqual(self.send().status_code,504)
  blocked=self.send();self.assertEqual(blocked.status_code,429);self.assertIn('Retry-After',blocked.headers)
  self.assertEqual(post.call_count,1)
