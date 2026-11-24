import { captureException } from '@sentry/nextjs';
import Head from 'next/head';
import { useSearchParams } from 'next/navigation';
import { useRouter } from 'next/router';
import { ReactElement, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { Loading } from '@/components';
import { LOGIN_URL, setAuthUrl, useAuth } from '@/features/auth';
import {
  LinkReach,
  LinkRole,
  useCreateDoc,
} from '@/features/docs/doc-management';
import { useUpdateDocLink } from '@/features/docs/doc-share/api/useUpdateDocLink';
import { useSkeletonStore } from '@/features/skeletons';
import { useCreatePlacedDoc } from '@/features/twake';
import { MainLayout } from '@/layouts';
import { NextPageWithLayout } from '@/types/next';

const Page: NextPageWithLayout = () => {
  const { t } = useTranslation();
  const { setIsSkeletonVisible } = useSkeletonStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const linkReach = searchParams.get('link-reach');
  const linkRole = searchParams.get('link-role');
  const title = searchParams.get('title');
  // From Drive: the instance and folder where the pointer of the document goes
  const instance = searchParams.get('instance');
  const dirId = searchParams.get('dir_id');
  const { authenticated } = useAuth();

  const { mutateAsync: createDocAsync, data: doc } = useCreateDoc();
  const { mutateAsync: createPlacedDocAsync, data: placedDoc } =
    useCreatePlacedDoc();

  const { mutateAsync: updateDocLinkAsync } = useUpdateDocLink();

  const redirectToDoc = useCallback(
    (docId: string) => {
      void router.push(`/docs/${docId}`);
    },
    [router],
  );

  useEffect(() => {
    setIsSkeletonVisible(true);
  }, [setIsSkeletonVisible]);

  useEffect(() => {
    if (doc || placedDoc) {
      return;
    }
    if (!authenticated) {
      setAuthUrl();
      window.location.replace(LOGIN_URL);
      return;
    }

    const create =
      instance && dirId
        ? createPlacedDocAsync({
            placement: { instance, dir_id: dirId },
            title: title || undefined,
          })
        : createDocAsync({ title: title || undefined });

    create
      .then((createdDoc) => {
        if ((linkReach && linkRole) || linkReach) {
          updateDocLinkAsync({
            id: createdDoc.id,
            link_reach: linkReach as LinkReach,
            link_role: (linkRole as LinkRole | undefined) || undefined,
          })
            .catch((error) => {
              captureException(error, {
                extra: {
                  docId: createdDoc.id,
                  linkReach,
                  linkRole,
                },
              });
            })
            .finally(() => {
              redirectToDoc(createdDoc.id);
            });

          return;
        }

        redirectToDoc(createdDoc.id);
      })
      .catch((error) => {
        captureException(error, {
          extra: {
            title,
          },
        });
      });
  }, [
    authenticated,
    createDocAsync,
    createPlacedDocAsync,
    dirId,
    doc,
    instance,
    linkReach,
    placedDoc,
    linkRole,
    redirectToDoc,
    title,
    updateDocLinkAsync,
  ]);

  return (
    <>
      <Head>
        <title>{`${t('New document', { description: 'Page title when creating a document' })} - ${t('Docs', { description: 'Product name, shown in page titles and the logo' })}`}</title>
        <meta
          property="og:title"
          content={`${t('New document', { description: 'Page title when creating a document' })} - ${t('Docs', { description: 'Product name, shown in page titles and the logo' })}`}
          key="title"
        />
      </Head>
      <Loading />
    </>
  );
};

Page.getLayout = function getLayout(page: ReactElement) {
  return (
    <>
      <Head>
        <meta name="robots" content="noindex" />
      </Head>

      <MainLayout enableResizablePanel={false}>{page}</MainLayout>
    </>
  );
};

export default Page;
