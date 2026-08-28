"use client";

/**
 * Lets a page name its own last breadcrumb crumb.
 *
 * The shell derives the breadcrumb from the pathname, which is right for
 * `/products` and `/categories` and wrong for `/products/<uuid>` — that
 * rendered `01a04736-e0c8-774e-80ec-97edf8546aba` as a crumb, which tells a
 * reader nothing and is the kind of thing only spotted by looking at the
 * running app.
 *
 * A context rather than a prop on the layout: the layout does not load the
 * product, the page does. `<BreadcrumbTitle title={product.name} />` renders
 * nothing and simply announces the name upward.
 */

import { createContext, useContext, useEffect, useMemo, useState } from "react";

type TitleContext = {
  readonly title: string | undefined;
  readonly setTitle: (title: string | undefined) => void;
};

const Context = createContext<TitleContext>({
  title: undefined,
  setTitle: () => undefined,
});

export function BreadcrumbTitleProvider({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const [title, setTitle] = useState<string | undefined>(undefined);
  const value = useMemo(() => ({ title, setTitle }), [title]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export const useBreadcrumbTitle = (): string | undefined =>
  useContext(Context).title;

/**
 * Renders nothing. Sets the crumb on mount and **clears it on unmount** —
 * without that, navigating from a product to the list would leave the
 * previous product's name sitting in the breadcrumb.
 */
export function BreadcrumbTitle({ title }: { readonly title: string }) {
  const { setTitle } = useContext(Context);

  useEffect(() => {
    setTitle(title);
    return () => setTitle(undefined);
  }, [setTitle, title]);

  return null;
}
