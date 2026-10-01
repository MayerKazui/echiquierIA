// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServiceWorkerContainerLike } from '../pwa/register';
import { UPDATE_CHECK_MS, useServiceWorkerUpdate } from './useServiceWorkerUpdate';

class FakeWorker extends EventTarget {
  state = 'installing';
  postMessage = vi.fn();
}

class FakeRegistration extends EventTarget {
  waiting: FakeWorker | null = null;
  installing: FakeWorker | null = null;
  update = vi.fn(async () => {});
}

class FakeContainer extends EventTarget {
  controller: object | null = null;
}

function setup(options: { controlled?: boolean; registration?: FakeRegistration; failRegister?: boolean } = {}) {
  const container = new FakeContainer();
  container.controller = options.controlled === false ? null : {};
  const registration = options.registration ?? new FakeRegistration();
  const register = vi.fn(async () => {
    if (options.failRegister) throw new Error('refused');
    return registration as unknown as ServiceWorkerRegistration;
  });
  const reload = vi.fn();
  const view = renderHook(() =>
    useServiceWorkerUpdate({
      enabled: true,
      container: container as unknown as ServiceWorkerContainerLike,
      register: register as never,
      reload,
    })
  );
  return { container, registration, register, reload, ...view };
}

const flush = () => act(async () => {});

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useServiceWorkerUpdate', () => {
  it('registers the worker', async () => {
    const { register } = setup();
    await flush();
    expect(register).toHaveBeenCalledTimes(1);
  });

  it('does nothing when it is not enabled (development, browser without service workers)', async () => {
    const register = vi.fn();
    renderHook(() => useServiceWorkerUpdate({ enabled: false, container: new FakeContainer() as never, register }));
    await flush();
    expect(register).not.toHaveBeenCalled();
  });

  it('does nothing without a container', async () => {
    const register = vi.fn();
    renderHook(() => useServiceWorkerUpdate({ enabled: true, container: undefined, register }));
    await flush();
    expect(register).not.toHaveBeenCalled();
  });

  it('says there is no update after the first installation (no worker controls the page yet)', async () => {
    const registration = new FakeRegistration();
    registration.waiting = new FakeWorker();
    const { result } = setup({ controlled: false, registration });
    await flush();
    expect(result.current.updateReady).toBe(false);
  });

  it('says an update is ready when a worker waits while another controls the page', async () => {
    const registration = new FakeRegistration();
    registration.waiting = new FakeWorker();
    const { result } = setup({ registration });
    await flush();
    expect(result.current.updateReady).toBe(true);
  });

  it('says an update is ready once a new worker has installed', async () => {
    const { result, registration } = setup();
    await flush();
    expect(result.current.updateReady).toBe(false);

    const worker = new FakeWorker();
    registration.installing = worker;
    act(() => registration.dispatchEvent(new Event('updatefound')));
    worker.state = 'installing';
    act(() => worker.dispatchEvent(new Event('statechange')));
    expect(result.current.updateReady).toBe(false);

    worker.state = 'installed';
    act(() => worker.dispatchEvent(new Event('statechange')));
    expect(result.current.updateReady).toBe(true);
  });

  it('does not take the first installation for an update', async () => {
    const { result, registration } = setup({ controlled: false });
    await flush();
    const worker = new FakeWorker();
    registration.installing = worker;
    act(() => registration.dispatchEvent(new Event('updatefound')));
    worker.state = 'installed';
    act(() => worker.dispatchEvent(new Event('statechange')));
    expect(result.current.updateReady).toBe(false);
  });

  describe('applyUpdate', () => {
    it('asks the waiting worker to take over, and reloads the page once it has', async () => {
      const registration = new FakeRegistration();
      const worker = new FakeWorker();
      registration.waiting = worker;
      const { result, container, reload } = setup({ registration });
      await flush();

      act(() => result.current.applyUpdate());
      expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
      expect(reload).not.toHaveBeenCalled(); // not before the new worker controls the page

      container.dispatchEvent(new Event('controllerchange'));
      expect(reload).toHaveBeenCalledTimes(1);
      container.dispatchEvent(new Event('controllerchange'));
      expect(reload).toHaveBeenCalledTimes(1);
    });

    it('asks once, however many times it is called', async () => {
      const registration = new FakeRegistration();
      const worker = new FakeWorker();
      registration.waiting = worker;
      const { result } = setup({ registration });
      await flush();
      act(() => result.current.applyUpdate());
      act(() => result.current.applyUpdate());
      expect(worker.postMessage).toHaveBeenCalledTimes(1);
    });

    it('does nothing when there is no update', async () => {
      const { result, reload } = setup();
      await flush();
      act(() => result.current.applyUpdate());
      expect(reload).not.toHaveBeenCalled();
    });
  });

  describe('looking for new versions', () => {
    it('asks every hour', async () => {
      const { registration } = setup();
      await flush();
      expect(registration.update).not.toHaveBeenCalled();
      await act(async () => {
        vi.advanceTimersByTime(UPDATE_CHECK_MS);
      });
      expect(registration.update).toHaveBeenCalledTimes(1);
      await act(async () => {
        vi.advanceTimersByTime(UPDATE_CHECK_MS);
      });
      expect(registration.update).toHaveBeenCalledTimes(2);
    });

    it('asks when the tab becomes visible again', async () => {
      const { registration } = setup();
      await flush();
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      expect(registration.update).toHaveBeenCalledTimes(1);
    });

    it('does not ask when the tab is hidden', async () => {
      const { registration } = setup();
      await flush();
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      expect(registration.update).not.toHaveBeenCalled();
    });

    it('survives a check that fails (offline)', async () => {
      const registration = new FakeRegistration();
      registration.update = vi.fn(async () => {
        throw new Error('offline');
      });
      setup({ registration });
      await flush();
      await act(async () => {
        vi.advanceTimersByTime(UPDATE_CHECK_MS);
      });
      expect(registration.update).toHaveBeenCalled();
    });

    it('stops asking when the app is closed', async () => {
      const { registration, unmount } = setup();
      await flush();
      unmount();
      await act(async () => {
        vi.advanceTimersByTime(UPDATE_CHECK_MS * 2);
      });
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      expect(registration.update).not.toHaveBeenCalled();
    });
  });

  it('carries on without a worker when the registration is refused', async () => {
    const { result } = setup({ failRegister: true });
    await flush();
    expect(result.current.updateReady).toBe(false);
    expect(console.warn).toHaveBeenCalled();
  });
});
