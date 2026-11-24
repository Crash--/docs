import { UserMenu } from '@gouvfr-lasuite/ui-components';
import { useTranslation } from 'react-i18next';
import { createGlobalStyle } from 'styled-components';

import { Box } from '@/components';
import { Waffle } from '@/components/Waffle';
import { ButtonLogin, gotoLogout, useAuth } from '@/features/auth';
import { HelpMenu } from '@/features/help';
import { LanguagePicker } from '@/features/language/components/LanguagePicker';
import { usePlatform } from '@/features/twake';

const FooterActionsGlobalStyle = createGlobalStyle`
  .user-menu__actions .c__language-picker{
    width: auto;
  }
`;

type FooterActionsProps = {
  withLogin?: boolean;
};

export const FooterActions = ({ withLogin }: FooterActionsProps) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  // On the platform the language is a setting of the Workplace, not of Docs
  const { platformURL } = usePlatform();

  const userMenu = user || {
    full_name: t('Guest', {
      description: 'Name displayed for a user not logged in',
    }),
    email: '',
  };

  return (
    <>
      <FooterActionsGlobalStyle />
      <Box
        $padding={{ horizontal: 'sm' }}
        $direction="row"
        $align="center"
        $gap="3xs"
        $justify="space-between"
        className="--docs--footer-actions"
      >
        <Box $direction="row" $align="center" $gap="3xs">
          <UserMenu
            user={userMenu}
            logout={user ? gotoLogout : undefined}
            actions={platformURL ? undefined : <LanguagePicker />}
            withMobileView={false}
          />
          <Waffle />
          {withLogin && <ButtonLogin />}
        </Box>
        <HelpMenu />
      </Box>
    </>
  );
};
