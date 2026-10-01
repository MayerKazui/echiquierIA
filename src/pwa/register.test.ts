import { describe, expect, it, vi } from 'vitest';
import { registerServiceWorker, type ServiceWorkerContainerLike } from './register';

function container() {
  const register = vi.fn(async () => ({}) as ServiceWorkerRegistration);
  return { register, controller: null, ...new EventTarget() } as unknown as ServiceWorkerContainerLike & {
    register: typeof register;
  };
}

describe('registerServiceWorker', () => {
  it('registers sw.js at the root of the site', async () => {
    const c = container();
    await registerServiceWorker(c, '/');
    expect(c.register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
  });

  it('registers it under the base path of a site in a sub-folder (GitHub Pages)', async () => {
    const c = container();
    await registerServiceWorker(c, '/echiquierIA/');
    expect(c.register).toHaveBeenCalledWith('/echiquierIA/sw.js', { scope: '/echiquierIA/' });
  });

  it('resolves with the registration', async () => {
    const c = container();
    await expect(registerServiceWorker(c, '/')).resolves.toEqual({});
  });
});
