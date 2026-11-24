import { VariantType } from '@gouvfr-lasuite/ui-components';
import { useTranslation } from 'react-i18next';
import { css } from 'styled-components';

import { Box, BoxButton, DropdownMenu, Icon, Text } from '@/components';
import {
  QuickSearchData,
  QuickSearchGroup,
  QuickSearchItemContent,
} from '@/components/quick-search';
import { useCunninghamTheme } from '@/cunningham';
import { Doc, Role, useTrans } from '@/docs/doc-management';
import { useToast } from '@/hooks';

import {
  Grant,
  useDeleteGrant,
  useGrants,
  useUpdateGrant,
} from '../api/useGrants';
import { Invitee } from '../api/useSuggestions';

type GroupRowProps = {
  name: string;
  memberCount: number | null;
  sharedDrive?: boolean;
  right?: React.ReactNode;
};

/** A group of the organization, or the members of a shared drive. */
export const GroupRow = ({
  name,
  memberCount,
  sharedDrive,
  right,
}: GroupRowProps) => {
  const { t } = useTranslation();
  const { spacingsTokens } = useCunninghamTheme();

  return (
    <QuickSearchItemContent
      alwaysShowRight={!!right}
      right={right}
      left={
        <Box $direction="row" $align="center" $gap={spacingsTokens['xs']}>
          <Icon iconName={sharedDrive ? 'folder_shared' : 'group'} />
          <Box $direction="column">
            <Text $size="sm" $weight="500">
              {sharedDrive
                ? t('Members of {{name}}', {
                    description:
                      'Name of the members of a shared drive in the share dialog',
                    name,
                  })
                : name}
            </Text>
            {memberCount !== null && (
              <Text $size="xs" $margin={{ top: '-2px' }} $variation="secondary">
                {t('{{count}} members', {
                  description: 'Number of members of a group, plural form',
                  count: memberCount,
                })}
              </Text>
            )}
          </Box>
        </Box>
      }
    />
  );
};

/** A group in the results of the search of the share dialog. */
export const InviteGroupRow = ({ user }: { user: Invitee }) => {
  const { t } = useTranslation();
  return (
    <Box
      $width="100%"
      data-testid={`search-group-row-${user.group?.id ?? ''}`}
      className="--docs--doc-share-modal-invite-group-row"
    >
      <GroupRow
        name={user.full_name}
        memberCount={user.group?.memberCount ?? null}
        right={
          <BoxButton
            className="right-hover"
            $direction="row"
            $align="center"
            $css={css`
              contain: content;
            `}
            $theme="brand"
            $variation="tertiary"
            $gap="var(--c--globals--spacings--xxxs)"
          >
            <Text $withThemeInherited $size="sm">
              {t('Add', {
                description:
                  'Label of the action adding people to the document',
              })}
            </Text>
            <Icon $withThemeInherited $size="sm" iconName="add" />
          </BoxButton>
        }
      />
    </Box>
  );
};

const GrantItem = ({ doc, grant }: { doc: Doc; grant: Grant }) => {
  const { t } = useTranslation();
  const { transRole, translatedRoles } = useTrans();
  const { toast } = useToast();
  const onError = () =>
    toast(
      t('Error while updating the group access.', {
        description: 'Toast shown when changing a group access failed',
      }),
      VariantType.ERROR,
      { duration: 4000 },
    );
  const { mutate: updateGrant } = useUpdateGrant();
  const { mutate: deleteGrant } = useDeleteGrant();
  // The members of a shared drive follow the drive: Drive manages them
  const canUpdate =
    doc.abilities.accesses_manage && grant.source_kind === 'group';

  return (
    <Box
      $width="100%"
      data-testid={`doc-share-grant-row-${grant.source_id}`}
      className="--docs--doc-share-grant-item"
    >
      <GroupRow
        name={grant.name}
        memberCount={grant.member_count}
        sharedDrive={grant.source_kind === 'shared_drive'}
        right={
          canUpdate ? (
            <DropdownMenu
              label={t('{{action}}, current role: {{role}}', {
                description: 'Accessible name of the role dropdown',
                action: t('Change role for {{name}}', {
                  description:
                    'Accessible name of the role dropdown of a member',
                  name: grant.name,
                }),
                role: transRole(grant.role),
              })}
              showArrow={true}
              arrowCss={css`
                color: var(
                  --c--contextuals--content--semantic--brand--tertiary
                );
                font-size: 16px;
              `}
              testId="doc-grant-role-dropdown"
              options={[
                ...Object.keys(translatedRoles).map((key, index, all) => ({
                  label: transRole(key as Role),
                  callback: () =>
                    updateGrant(
                      { docId: doc.id, grantId: grant.id, role: key as Role },
                      { onError },
                    ),
                  isSelected: grant.role === key,
                  showSeparator: index === all.length - 1,
                })),
                {
                  label: t('Remove access', {
                    description:
                      'Menu action removing a member from a document',
                  }),
                  callback: () =>
                    deleteGrant(
                      { docId: doc.id, grantId: grant.id },
                      { onError },
                    ),
                },
              ]}
              buttonCss={css`
                &:hover {
                  background: none;
                }
                font-size: 12px;
              `}
            >
              <Text $theme="brand" $variation="tertiary">
                {transRole(grant.role)}
              </Text>
            </DropdownMenu>
          ) : (
            <Text $variation="tertiary" $weight={500} $size="s">
              {transRole(grant.role)}
            </Text>
          )
        }
      />
    </Box>
  );
};

/** The groups and shared drives a document is shared with, in the share dialog. */
export const QuickSearchGroupGrant = ({ doc }: { doc: Doc }) => {
  const { t } = useTranslation();
  const { data: grants } = useGrants(doc.id, doc.abilities.accesses_view);

  if (!grants?.length) {
    return null;
  }

  const group: QuickSearchData<Grant> = {
    groupName: t('Shared with {{count}} groups', {
      description: 'Number of groups a document is shared with, plural form',
      count: grants.length,
    }),
    elements: grants,
  };

  return (
    <Box
      aria-label={t('List groups card', {
        description: 'Accessible name of the list of groups with access',
      })}
      $padding={{ horizontal: 'base', bottom: '3xs' }}
    >
      <QuickSearchGroup
        group={group}
        renderElement={(grant) => <GrantItem doc={doc} grant={grant} />}
      />
    </Box>
  );
};
