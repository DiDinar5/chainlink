/**
 * Verification status (KYC / World ID / access level).
 * Stub: all false / none. TODO: read from passRegistry, kycBroker + IDKit verify + Sumsub callback.
 */
import { createContext, useContext, type ReactNode } from "react";

export type AccessLevel = "none" | "kyc" | "worldid" | "full";

export type VerificationState = {
  kycVerified: boolean;
  worldIdVerified: boolean;
  accessLevel: AccessLevel;
};

const stubState: VerificationState = {
  kycVerified: false,
  worldIdVerified: false,
  accessLevel: "none",
};

const VerificationContext = createContext<VerificationState>(stubState);

export function VerificationProvider({ children }: { children: ReactNode }) {
  return (
    <VerificationContext.Provider value={stubState}>
      {children}
    </VerificationContext.Provider>
  );
}

export function useVerification(): VerificationState {
  const ctx = useContext(VerificationContext);
  return ctx ?? stubState;
}
