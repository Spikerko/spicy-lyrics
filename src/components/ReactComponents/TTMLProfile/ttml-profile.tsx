import React from "react";
import ProfileDisplay from "./components/profile-display.tsx";

export default function TTMLProfile({ userId, hasProfileBanner }: { userId: string; hasProfileBanner: boolean }) {
  return <ProfileDisplay userId={userId} hasProfileBanner={hasProfileBanner} />;
}
