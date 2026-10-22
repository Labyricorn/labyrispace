// Copyright 2025, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
// Modified by Labyricorn for Labyrispace: remove Wave upgrade promotions.

import { MessageModal } from "@/app/modals/messagemodal";
import { NewInstallOnboardingModal } from "@/app/onboarding/onboarding";
import { DeleteFileModal, PublishAppModal, RenameFileModal } from "@/builder/builder-apppanel";
import { SetSecretDialog } from "@/builder/tabs/builder-secrettab";
import { AboutModal } from "./about";
import { UserInputModal } from "./userinputmodal";

const modalRegistry: { [key: string]: React.ComponentType<any> } = {
    [NewInstallOnboardingModal.displayName || "NewInstallOnboardingModal"]: NewInstallOnboardingModal,
    [UserInputModal.displayName || "UserInputModal"]: UserInputModal,
    [AboutModal.displayName || "AboutModal"]: AboutModal,
    [MessageModal.displayName || "MessageModal"]: MessageModal,
    [PublishAppModal.displayName || "PublishAppModal"]: PublishAppModal,
    [RenameFileModal.displayName || "RenameFileModal"]: RenameFileModal,
    [DeleteFileModal.displayName || "DeleteFileModal"]: DeleteFileModal,
    [SetSecretDialog.displayName || "SetSecretDialog"]: SetSecretDialog,
};

export const getModalComponent = (key: string): React.ComponentType<any> | undefined => {
    return modalRegistry[key];
};
