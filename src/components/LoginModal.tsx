import { useClerk, useUser } from '@clerk/clerk-react';
export function LoginModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { openSignIn } = useClerk();
  const { isSignedIn } = useUser();
  if (!isOpen || isSignedIn) return null;
  return <div role="dialog" aria-modal="true" aria-label="Sign in" className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4"><div className="bg-white rounded-xl p-6 space-y-4"><h2 className="font-semibold text-lg">Sign in to DiagNXT</h2><button className="btn btn-primary" onClick={() => { onClose(); openSignIn({ forceRedirectUrl: `${window.location.origin}${window.location.pathname}#/` }); }}>Sign in</button><button className="btn btn-secondary" onClick={onClose}>Cancel</button></div></div>;
}
