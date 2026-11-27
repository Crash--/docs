import { User } from '@/features/auth';

/**
 * Who the user may share with, from `GET /contacts/suggest` of their Workplace:
 * the groups of the organization first, then the people Common Contacts shows
 * them. A group gives a grant, a person an access or an invitation by email.
 */
export type Suggestion =
  | {
      kind: 'group';
      id: string;
      name: string;
      memberCount: number;
      /** The directory entry of an organization group, where its members are read */
      organizationId: string | null;
      externalId: string | null;
    }
  | { kind: 'person'; email: string; fullName: string };

export interface ApiSuggestion {
  type: string;
  id?: string;
  attributes: {
    name?: string;
    member_count?: number;
    organization_id?: string;
    external_id?: string;
    fullname?: string;
    email?: { address: string; primary?: boolean }[];
  };
}

export const toSuggestions = (data: ApiSuggestion[]): Suggestion[] => {
  const result: Suggestion[] = [];
  for (const item of data) {
    if (item.type === 'io.cozy.contacts.groups') {
      result.push({
        kind: 'group',
        id: item.id ?? '',
        name: item.attributes.name ?? '',
        memberCount: item.attributes.member_count ?? 0,
        organizationId: item.attributes.organization_id ?? null,
        externalId: item.attributes.external_id ?? null,
      });
      continue;
    }
    const emails = item.attributes.email ?? [];
    const email = emails.find((e) => e.primary)?.address ?? emails[0]?.address;
    if (!email) {
      continue;
    }
    result.push({
      kind: 'person',
      email,
      fullName: item.attributes.fullname ?? '',
    });
  }
  return result;
};

/**
 * A suggestion as the share dialog of Docs lists it: a `User` for the rows
 * it already renders, with the group kept aside. The e-mail is the id of a
 * person, as for the invitees typed by hand.
 */
export type Invitee = User & {
  group?: {
    id: string;
    memberCount: number;
    organizationId: string | null;
    externalId: string | null;
  };
};

export const toInvitee = (suggestion: Suggestion): Invitee =>
  suggestion.kind === 'group'
    ? {
        id: `group:${suggestion.id}`,
        email: '',
        full_name: suggestion.name,
        short_name: suggestion.name,
        is_first_connection: false,
        group: {
          id: suggestion.id,
          memberCount: suggestion.memberCount,
          organizationId: suggestion.organizationId,
          externalId: suggestion.externalId,
        },
      }
    : {
        id: suggestion.email,
        email: suggestion.email,
        full_name: suggestion.fullName,
        short_name: suggestion.fullName,
        is_first_connection: false,
      };
