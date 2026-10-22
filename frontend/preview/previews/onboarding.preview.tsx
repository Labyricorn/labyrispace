// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { InitPage, NoTelemetryStarPage } from "@/app/onboarding/onboarding";
import { OnboardingGradientBg } from "@/app/onboarding/onboarding-common";
import { DurableSessionPage } from "@/app/onboarding/onboarding-durable";
import { FilesPage, MagnifyBlocksPage, WaveAIPage } from "@/app/onboarding/onboarding-features";

function OnboardingModalWrapper({ width, children }: { width: string; children: React.ReactNode }) {
    return (
        <div className={`${width} rounded-[10px] p-[30px] relative overflow-hidden bg-panel`}>
            <OnboardingGradientBg />
            <div className="relative z-10 flex flex-col w-full h-full">{children}</div>
        </div>
    );
}

function OnboardingFeaturesV() {
    const noop = () => {};
    return (
        <div className="flex flex-col w-full gap-8">
            <OnboardingModalWrapper width="w-[560px]">
                <InitPage isCompact={false} telemetryUpdateFn={async () => {}} />
            </OnboardingModalWrapper>
            <OnboardingModalWrapper width="w-[560px]">
                <NoTelemetryStarPage isCompact={false} />
            </OnboardingModalWrapper>
            <OnboardingModalWrapper width="w-[800px]">
                <WaveAIPage onNext={noop} onSkip={noop} />
            </OnboardingModalWrapper>
            <OnboardingModalWrapper width="w-[800px]">
                <DurableSessionPage onNext={noop} onSkip={noop} onPrev={noop} />
            </OnboardingModalWrapper>
            <OnboardingModalWrapper width="w-[800px]">
                <MagnifyBlocksPage onNext={noop} onSkip={noop} onPrev={noop} />
            </OnboardingModalWrapper>
            <OnboardingModalWrapper width="w-[800px]">
                <FilesPage onFinish={noop} onPrev={noop} />
            </OnboardingModalWrapper>
        </div>
    );
}

export function OnboardingPreview() {
    return (
        <div className="w-full max-w-[1300px] py-10 px-4 flex flex-col gap-8">
            <div className="text-sm font-mono text-muted">Onboarding features</div>
            <OnboardingFeaturesV />
        </div>
    );
}
