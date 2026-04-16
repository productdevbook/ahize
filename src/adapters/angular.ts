// Angular v16+ standalone-compatible service factory.
// Consumer brings their Injectable + their Router for navigation events.

import type { Identity, IdentityState, LoadOptions } from "../_types.ts";

interface AhizeProvider {
  load(options: LoadOptions): Promise<void>;
  identify(identity: Identity): Promise<void>;
  pageView(info?: { path?: string; locale?: string }): Promise<void>;
  shutdown(): Promise<void>;
  isReady(): boolean;
  getIdentity(): IdentityState;
}

interface RouterLike {
  events: {
    subscribe: (cb: (event: { url?: string; constructor: { name: string } }) => void) => {
      unsubscribe(): void;
    };
  };
}

export class AhizeAngularService<T extends LoadOptions> {
  private subscription: { unsubscribe(): void } | undefined;

  constructor(
    private readonly provider: AhizeProvider,
    private readonly options: T,
    private readonly router?: RouterLike,
  ) {}

  async init(identity?: Identity): Promise<void> {
    if (typeof window === "undefined") return;
    await this.provider.load(this.options);
    if (identity) await this.provider.identify(identity);

    if (this.router) {
      this.subscription = this.router.events.subscribe((event) => {
        if (event.constructor.name === "NavigationEnd" && event.url) {
          void this.provider.pageView({ path: event.url });
        }
      });
    }
  }

  identify(identity: Identity): Promise<void> {
    return this.provider.identify(identity);
  }

  pageView(info?: { path?: string; locale?: string }): Promise<void> {
    return this.provider.pageView(info);
  }

  isReady(): boolean {
    return this.provider.isReady();
  }

  getIdentity(): IdentityState {
    return this.provider.getIdentity();
  }

  destroy(): void {
    this.subscription?.unsubscribe();
    void this.provider.shutdown();
  }
}
