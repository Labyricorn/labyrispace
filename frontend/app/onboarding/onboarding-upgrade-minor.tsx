// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
// Modified by Labyricorn for Labyrispace: remove upstream upgrade promotion.

// Compatibility exports for the inherited preview gallery only. No upgrade
// promotion, GitHub solicitation, modal, or startup side effect remains here.
type UpgradeMinorWelcomePageProps = {
    onStarClick: () => void;
    onAlreadyStarred: () => void;
    onMaybeLater: () => void;
};
const UpgradeMinorWelcomePage = (_props: UpgradeMinorWelcomePageProps) => null;
const UpgradeOnboardingMinor = () => null;
UpgradeMinorWelcomePage.displayName = "UpgradeMinorWelcomePage";
UpgradeOnboardingMinor.displayName = "UpgradeOnboardingMinor";
export { UpgradeMinorWelcomePage, UpgradeOnboardingMinor };
