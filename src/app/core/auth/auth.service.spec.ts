import { TestBed } from '@angular/core/testing';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';

import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';

describe('AuthService', () => {
  let service: AuthService;
  let httpTestingController: HttpTestingController;

  const sessionUrl = `${environment.apiUrl}/auth/me`;

  const mockUser = {
    id: 'user-1',
    name: 'Han Yoo',
    email: 'han@example.com',
  };

  beforeEach(() => {
    sessionStorage.clear();

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    service = TestBed.inject(AuthService);
    httpTestingController = TestBed.inject(
      HttpTestingController
    );
  });

  afterEach(() => {
    httpTestingController.verify();
    sessionStorage.clear();
  });

  it('should not mark the session as expired on first visit', () => {
    let result: boolean | undefined;

    service.verifySession().subscribe(value => {
      result = value;
    });

    const request =
      httpTestingController.expectOne(sessionUrl);

    request.flush(
      { error: 'Unauthorized' },
      {
        status: 401,
        statusText: 'Unauthorized',
      }
    );

    expect(result).toBe(false);
    expect(service.sessionExpired()).toBe(false);
    expect(service.isAuthenticated()).toBe(false);
  });

  it('should mark the session as expired when an existing session returns 401', () => {
    sessionStorage.setItem(
      'smartmoney-had-session',
      'true'
    );

    let result: boolean | undefined;

    service.verifySession().subscribe(value => {
      result = value;
    });

    const request =
      httpTestingController.expectOne(sessionUrl);

    request.flush(
      { error: 'Unauthorized' },
      {
        status: 401,
        statusText: 'Unauthorized',
      }
    );

    expect(result).toBe(false);
    expect(service.sessionExpired()).toBe(true);
    expect(service.isAuthenticated()).toBe(false);
  });

  it('should not mark the session as expired when the server returns 500', () => {
    sessionStorage.setItem(
      'smartmoney-had-session',
      'true'
    );

    let result: boolean | undefined;

    service.verifySession().subscribe(value => {
      result = value;
    });

    const request =
      httpTestingController.expectOne(sessionUrl);

    request.flush(
      { error: 'Internal Server Error' },
      {
        status: 500,
        statusText: 'Internal Server Error',
      }
    );

    expect(result).toBe(false);
    expect(service.sessionExpired()).toBe(false);
  });

  it('should share one session verification request between concurrent subscribers', () => {
    let firstResult: boolean | undefined;
    let secondResult: boolean | undefined;

    service.verifySession().subscribe(value => {
      firstResult = value;
    });

    service.verifySession().subscribe(value => {
      secondResult = value;
    });

    const requests =
      httpTestingController.match(sessionUrl);

    expect(requests.length).toBe(1);

    requests[0].flush({
      user: mockUser,
    });

    expect(firstResult).toBe(true);
    expect(secondResult).toBe(true);
    expect(service.isAuthenticated()).toBe(true);
    expect(service.currentUser()).toEqual({
      name: 'Han Yoo',
      email: 'han@example.com',
    });
  });
});