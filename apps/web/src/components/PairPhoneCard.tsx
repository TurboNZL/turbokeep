import { api } from '../lib/api.ts';
import { useStore } from '../lib/store.ts';
import { serverBase } from '../lib/native.ts';
import { createPairCodec } from '../lib/pairCode.ts';
import { PairDevice } from './PairDevice.tsx';
import { Section } from './Section.tsx';

/** TurboKeep's pairing codes start with KEEP1-, so one made for another TurboNZL app is never taken for this one's. The Android app reads them (SetupActivity). */
export const keepCodec = createPairCodec('KEEP1-');

/**
 * Settings > This app: a code that sets up the Android app in one paste: the server's address, its own API token (made now, named "Paired device", and
 * revocable on its own in Account > API tokens) and, when the server is behind Cloudflare Access, the service token that goes with every request as
 * the CF-Access-Client-Id / -Secret headers. The app's web page signs in by itself (cookie); the widget is what needs this.
 */
export function PairPhoneCard() {
  const { cfAccessId, cfAccessSecret } = useStore((s) => s.settings);
  return (
    <Section title="Pair a phone">
      <p className="text-sm text-muted">Sets up the TurboKeep Android app (its widget, quick add and share target) in one paste: the address, a token of its own and, if you saved one above, the Cloudflare Access service token.</p>
      <PairDevice codec={keepCodec} appName="TurboKeep" defaultAddress={serverBase() || location.origin} getToken={async () => (await api.createToken('Paired device')).token} access={{ id: cfAccessId, secret: cfAccessSecret }} addressPlaceholder="https://keep.example.com"
        label="Make a pairing code" afterMake="On the phone, open the TurboKeep app. On its first screen (or Settings > This app > Change server) paste the code under “Pairing code” and press Use code." />
    </Section>
  );
}
