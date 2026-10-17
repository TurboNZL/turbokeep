import { ServerConnectCard } from '../components/ServerConnectCard.tsx';

/** The Android app's first screen (its page is bundled, like TurboMusic's): where is your server? Then the sign-in page. */
export function ConnectPage() {
  return (
    <div className="mx-auto grid min-h-full max-w-xl place-items-center p-4">
      <div className="w-full space-y-3">
        <div className="flex items-center gap-3"><img src="/icon.svg" alt="" width={36} height={36} /><div><h1 className="text-lg font-bold">TurboKeep</h1><p className="text-xs text-muted">Connect to your server</p></div></div>
        <ServerConnectCard title="Your server" />
      </div>
    </div>
  );
}
