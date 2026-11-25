import { Button } from '@gouvfr-lasuite/ui-components';
import { type IntentServiceAPI, Intents } from 'cozy-interapp';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import { ReactElement, ReactNode, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Box, Loading, Text } from '@/components';
import { KEY_DOC, useDoc } from '@/docs/doc-management';
import { useAuth, useAuthQuery } from '@/features/auth';
import { refreshURLOf, usePlatform, useTwakeSession } from '@/features/twake';
import { NextPageWithLayout } from '@/types/next';

const DocShareModal = dynamic(
  () =>
    import('@/features/docs/doc-share/components/DocShareModal').then(
      (mod) => ({ default: mod.DocShareModal }),
    ),
  { ssr: false },
);

/**
 * The share dialog of a document as a service of the cozy intent SHARE: Drive
 * frames this page with the id of the intent in the URL, the page reads the
 * id of the document from the data of the intent, and shows the dialog of Docs.
 * Closing it cancels the intent, which removes the frame.
 */
const Page: NextPageWithLayout = () => {
  const { t } = useTranslation();
  const { sdk, status } = usePlatform();
  const { authenticated, hasInitiallyLoaded } = useAuth();
  // Docs itself does not answer (its backend is down): nothing can be shared
  const { isError: docsUnreachable } = useAuthQuery();
  const {
    data: session,
    isFetched: sessionFetched,
    error: sessionError,
  } = useTwakeSession(authenticated);
  // The id token of the session has expired: only a tab of Docs renews it
  const mustRenew = !!refreshURLOf(sessionError);
  const [service, setService] = useState<IntentServiceAPI | null>(null);
  const [docId, setDocId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  // The service protocol takes each of these once
  const started = useRef(false);
  const readyToUse = useRef(false);
  const ended = useRef(false);

  useEffect(() => {
    if (!sdk || status !== 'ready' || started.current) {
      return;
    }
    started.current = true;
    new Intents({ client: sdk })
      .createService(null, window, { requireFrameAncestors: true })
      .then((created) => {
        const data = created.getData() as { externalId?: string } | null;
        if (!data?.externalId) {
          ended.current = true;
          created.throw(new Error('The intent names no document'));
          setFailed(true);
          return;
        }
        setService(created);
        setDocId(data.externalId);
      })
      .catch(() => setFailed(true));
  }, [sdk, status]);

  const { data: doc, isError } = useDoc(
    { id: docId ?? '' },
    { enabled: !!docId, queryKey: [KEY_DOC, { id: docId }] },
  );

  useEffect(() => {
    if (doc && service && !readyToUse.current) {
      readyToUse.current = true;
      service.notifyReadyToUse();
    }
  }, [doc, service]);

  const onClose = () => {
    if (service && !ended.current) {
      ended.current = true;
      service.cancel();
    }
  };

  if (docsUnreachable) {
    return (
      <Message>
        {t('This document cannot be shared from here.', {
          description:
            'Message of the share page framed by Drive when the document cannot be loaded',
        })}
      </Message>
    );
  }
  if ((hasInitiallyLoaded && !authenticated) || mustRenew) {
    // No login can happen in the frame of Drive (ADR 052): Docs opens in a tab
    return (
      <Message>
        {t('Sign in to Docs in another tab, then share again from Drive.', {
          description:
            'Message of the share page framed by Drive when the user has no Docs session',
        })}
        <Box $margin={{ top: 'base' }}>
          <Button
            onClick={() => window.open('/', '_blank', 'noopener')}
            size="small"
          >
            {t('Open Docs', {
              description:
                'Button of the share page framed by Drive opening Docs in a new tab',
            })}
          </Button>
        </Box>
      </Message>
    );
  }
  const offPlatform = sessionFetched && !session?.workplace_fqdn;
  if (failed || isError || offPlatform || status === 'failed') {
    return (
      <Message>
        {t('This document cannot be shared from here.', {
          description:
            'Message of the share page framed by Drive when the document cannot be loaded',
        })}
      </Message>
    );
  }
  if (!doc || !service) {
    return <Loading />;
  }

  return (
    <>
      <Head>
        <meta name="robots" content="noindex" />
      </Head>
      <DocShareModal doc={doc} onClose={onClose} />
    </>
  );
};

const Message = ({ children }: { children: ReactNode }) => (
  <Box $align="center" $justify="center" $height="100dvh" $padding="base">
    <Text $textAlign="center" $variation="secondary">
      {children}
    </Text>
  </Box>
);

// No bar and no panels: the frame of Drive shows the dialog alone
Page.getLayout = (page: ReactElement) => page;

export default Page;
