import { toInvitee, toSuggestions } from '../suggestions';

describe('toSuggestions', () => {
  it('maps groups and people of /contacts/suggest, skipping people without email', () => {
    const suggestions = toSuggestions([
      {
        type: 'io.cozy.contacts.groups',
        id: 'stack-id',
        attributes: {
          name: 'RH',
          member_count: 3,
          twakeDirectory: { externalId: 'ldap-rh' },
        },
      },
      {
        type: 'io.cozy.contacts',
        attributes: {
          fullname: 'Bob',
          email: [
            { address: 'other@acme.test' },
            { address: 'bob@acme.test', primary: true },
          ],
        },
      },
      { type: 'io.cozy.contacts', attributes: { fullname: 'No mail' } },
    ]);

    expect(suggestions).toEqual([
      { kind: 'group', id: 'ldap-rh', name: 'RH', memberCount: 3 },
      { kind: 'person', email: 'bob@acme.test', fullName: 'Bob' },
    ]);
  });
});

describe('toInvitee', () => {
  it('gives a person the email as id, as the invitees typed by hand', () => {
    const invitee = toInvitee({
      kind: 'person',
      email: 'bob@acme.test',
      fullName: 'Bob',
    });
    expect(invitee.id).toBe(invitee.email);
    expect(invitee.group).toBeUndefined();
  });

  it('keeps the group aside of the user fields', () => {
    const invitee = toInvitee({
      kind: 'group',
      id: 'ldap-rh',
      name: 'RH',
      memberCount: 3,
    });
    expect(invitee.full_name).toBe('RH');
    expect(invitee.group).toEqual({ id: 'ldap-rh', memberCount: 3 });
  });
});
