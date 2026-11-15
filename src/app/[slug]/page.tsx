import type { Metadata } from "next";
import { notFound } from "next/navigation";
import DisplayApp from "@/components/display/DisplayApp";

export const metadata: Metadata = {
  title: "Paparan TV",
  robots: { index: false },
};

/**
 * Public TV display. No login. All data comes from the read-only public
 * payload API so the page shell can be cached and works offline.
 */
export default async function DisplayPage({ params }: PageProps<"/[slug]">) {
  const { slug } = await params;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length < 3 || slug.length > 60) notFound();
  return <DisplayApp slug={slug} />;
}
