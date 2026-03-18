import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { Button, Header, Icons, useModal, useUserAuthentication } from '@ohif/ui-next';
import { useSystem } from '@ohif/core';
import { Toolbar } from '../Toolbar/Toolbar';
import HeaderPatientInfo from './HeaderPatientInfo';
import { PatientInfoVisibility } from './HeaderPatientInfo/HeaderPatientInfo';
import { preserveQueryParameters } from '@ohif/app';
import { Types } from '@ohif/core';

function ViewerHeader({ appConfig }: withAppTypes<{ appConfig: AppTypes.Config }>) {
  const { servicesManager, extensionManager, commandsManager } = useSystem();
  const { customizationService, userAuthenticationService } = servicesManager.services;
  const [userAuthenticationState] = useUserAuthentication();
  const authenticatedUser = userAuthenticationState?.user;

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const currentUsername =
      authenticatedUser?.username ??
      authenticatedUser?.name ??
      authenticatedUser?.profile?.preferred_username;

    if (currentUsername) {
      return;
    }

    let isSubscribed = true;

    fetch('/api/session-user', {
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
      },
    })
      .then(async response => {
        if (!response.ok) {
          return null;
        }

        return response.json();
      })
      .then(payload => {
        if (!isSubscribed || !payload?.user?.username) {
          return;
        }

        userAuthenticationService.setUser({
          ...authenticatedUser,
          ...payload.user,
          name: payload.user.username,
          profile: {
            ...(authenticatedUser?.profile || {}),
            preferred_username: payload.user.username,
          },
        });
      })
      .catch(() => {
        // If the endpoint is not available, keep the header functional without blocking OHIF.
      });

    return () => {
      isSubscribed = false;
    };
  }, [authenticatedUser, userAuthenticationService]);

  const displayUsername =
    authenticatedUser?.username ??
    authenticatedUser?.name ??
    authenticatedUser?.profile?.preferred_username;
  const displayRole = authenticatedUser?.role;

  const onClickReturnButton = () => {
    const { pathname } = location;
    const dataSourceIdx = pathname.indexOf('/', 1);

    const dataSourceName = pathname.substring(dataSourceIdx + 1);
    const existingDataSource = extensionManager.getDataSources(dataSourceName);

    const searchQuery = new URLSearchParams();
    if (dataSourceIdx !== -1 && existingDataSource) {
      searchQuery.append('datasources', pathname.substring(dataSourceIdx + 1));
    }
    preserveQueryParameters(searchQuery);

    navigate({
      pathname: '/',
      search: decodeURIComponent(searchQuery.toString()),
    });
  };

  const { t } = useTranslation();
  const { show } = useModal();

  const AboutModal = customizationService.getCustomization(
    'ohif.aboutModal'
  ) as Types.MenuComponentCustomization;

  const UserPreferencesModal = customizationService.getCustomization(
    'ohif.userPreferencesModal'
  ) as Types.MenuComponentCustomization;

  const menuOptions = [
    {
      title: AboutModal?.menuTitle ?? t('Header:About'),
      icon: 'info',
      onClick: () =>
        show({
          content: AboutModal,
          title: AboutModal?.title ?? t('AboutModal:About OHIF Viewer'),
          containerClassName: AboutModal?.containerClassName ?? 'max-w-md',
        }),
    },
    {
      title: UserPreferencesModal.menuTitle ?? t('Header:Preferences'),
      icon: 'settings',
      onClick: () =>
        show({
          content: UserPreferencesModal,
          title: UserPreferencesModal.title ?? t('UserPreferencesModal:User preferences'),
          containerClassName:
            UserPreferencesModal?.containerClassName ?? 'flex max-w-4xl p-6 flex-col',
        }),
    },
  ];

  if (appConfig.oidc) {
    menuOptions.push({
      title: t('Header:Logout'),
      icon: 'power-off',
      onClick: async () => {
        navigate(`/logout?redirect_uri=${encodeURIComponent(window.location.href)}`);
      },
    });
  }

  return (
    <Header
      menuOptions={menuOptions}
      isReturnEnabled={!!appConfig.showStudyList}
      onClickReturnButton={onClickReturnButton}
      WhiteLabeling={appConfig.whiteLabeling}
      Secondary={<Toolbar buttonSection="secondary" />}
      PatientInfo={
        appConfig.showPatientInfo !== PatientInfoVisibility.DISABLED && (
          <HeaderPatientInfo
            servicesManager={servicesManager}
            appConfig={appConfig}
          />
        )
      }
      UndoRedo={
        <div className="text-primary flex cursor-pointer items-center">
          <Button
            variant="ghost"
            className="hover:bg-muted"
            onClick={() => {
              commandsManager.run('undo');
            }}
          >
            <Icons.Undo className="" />
          </Button>
          <Button
            variant="ghost"
            className="hover:bg-muted"
            onClick={() => {
              commandsManager.run('redo');
            }}
          >
            <Icons.Redo className="" />
          </Button>
        </div>
      }
      UserInfo={
        displayUsername ? (
          <div className="text-primary bg-muted/70 mr-2 flex items-center gap-2 rounded-md px-3 py-1 text-sm">
            <Icons.Patient className="h-4 w-4" />
            <span className="font-medium">{displayUsername}</span>
            {displayRole ? (
              <span className="text-muted-foreground border-muted rounded border px-1.5 py-0.5 text-xs uppercase">
                {displayRole}
              </span>
            ) : null}
          </div>
        ) : null
      }
    >
      <div className="relative flex justify-center gap-[4px]">
        <Toolbar buttonSection="primary" />
      </div>
    </Header>
  );
}

export default ViewerHeader;
