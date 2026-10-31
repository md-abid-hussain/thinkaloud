import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ChatApp } from "@/components/chat/ChatApp";
import { catalog } from "@/lib/catalog";
import "@/components/chat/chat.css";

export async function generateStaticParams() {
  return (await catalog()).map((map) => ({ slug: map.project.slug }));
}

export default function ProjectPage({ params }: PageProps<"/projects/[slug]/learn">) {
  return (
    <Suspense fallback={<p className="quiet loading" style={{ padding: 24 }}>Opening the project</p>}>
      <Project params={params} />
    </Suspense>
  );
}

async function Project({ params }: { params: PageProps<"/projects/[slug]/learn">["params"] }) {
  const { slug } = await params;
  const map = (await catalog()).find((m) => m.project.slug === slug);
  if (!map) notFound();
  return <ChatApp slug={slug} title={map.project.title} sourceUrl={map.project.source_url} />;
}
