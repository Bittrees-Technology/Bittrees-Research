import { Link } from "react-router";
import { PageHeader } from "@/components/PageHeader";
import { useParagraphPosts } from "@/hooks/useParagraphPosts";
import type { ParagraphPost } from "@/lib/paragraph";
import { RESEARCH_LINKS } from "@/lib/links";

export default function ResearchPage() {
  const { data: posts, isLoading, isError } = useParagraphPosts();

  return (
    <div>
      <PageHeader
        label="Research"
        title="Research Library"
        intro="Original essays and analysis on emerging technology, systems innovation, and the institutions of a more equitable digital future."
      />

      <section style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'1rem',flexWrap:'wrap',padding:'1.25rem 0',marginBottom:'1.5rem',borderBottom:'1px solid var(--color-border)'}}><div><h2 style={{fontSize:'1.2rem',margin:'0 0 .4rem'}}>Have a question for the community?</h2><p style={{margin:0,color:'var(--color-ink-muted)'}}>Members can request research. Credentialed researchers can accept the work.</p></div><Link className="btn-primary" to="/research/requests">Research requests</Link></section>
      {isLoading && <FeedSkeleton />}

      {isError && (
        <div className="card-subtle" style={{ padding: "1.5rem", maxWidth: "640px" }}>
          <p style={{ fontSize: "0.9rem", color: "var(--color-ink-muted)", marginBottom: "1rem" }}>
            The research feed couldn't load right now. You can read the archive on Paragraph.
          </p>
          <a className="btn-ghost" href={RESEARCH_LINKS.paragraph} target="_blank" rel="noreferrer">
            Read on Paragraph ↗
          </a>
        </div>
      )}

      {posts && posts.length > 0 && (
        <>
          <FeaturedCard post={posts[0]} />
          {posts.length > 1 && (
            <div
              style={{
                marginTop: "1.5rem",
                display: "grid",
                gap: "1.25rem",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              }}
            >
              {posts.slice(1).map((p) => (
                <PostCard key={p.guid} post={p} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FeaturedCard({ post }: { post: ParagraphPost }) {
  return (
    <Link
      to={`/research/${post.slug}`}
      className="card-link"
      style={{ display: "grid", gap: "1.25rem", gridTemplateColumns: "1fr", padding: 0, overflow: "hidden" }}
    >
      {post.image && (
        <img
          src={post.image}
          alt=""
          style={{ width: "100%", height: "280px", objectFit: "cover", display: "block" }}
          loading="lazy"
        />
      )}
      <div style={{ padding: "0 1.5rem 1.5rem" }}>
        <span className="text-label" style={{ color: "var(--color-primary-hover)" }}>
          Latest{post.dateLabel ? ` · ${post.dateLabel}` : ""}
        </span>
        <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "1.75rem", margin: "0.4rem 0 0.5rem", lineHeight: 1.2 }}>
          {post.title}
        </h2>
        <p style={{ fontSize: "0.95rem", color: "var(--color-ink-muted)", margin: 0 }}>
          {clamp(post.excerpt, 240)}
        </p>
      </div>
    </Link>
  );
}

function PostCard({ post }: { post: ParagraphPost }) {
  return (
    <Link to={`/research/${post.slug}`} className="card-link" style={{ padding: 0, overflow: "hidden" }}>
      {post.image && (
        <img
          src={post.image}
          alt=""
          style={{ width: "100%", height: "150px", objectFit: "cover", display: "block" }}
          loading="lazy"
        />
      )}
      <div style={{ padding: "1.1rem 1.25rem" }}>
        <span className="text-label">{post.dateLabel}</span>
        <h3 style={{ fontFamily: "var(--font-serif)", fontSize: "1.2rem", margin: "0.3rem 0 0.4rem", lineHeight: 1.25 }}>
          {post.title}
        </h3>
        <p style={{ fontSize: "0.85rem", color: "var(--color-ink-muted)", margin: 0 }}>
          {clamp(post.excerpt, 120)}
        </p>
      </div>
    </Link>
  );
}

function FeedSkeleton() {
  return (
    <div style={{ display: "grid", gap: "1.25rem", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="card" style={{ padding: 0 }}>
          <div className="skeleton" style={{ height: "150px" }} />
          <div style={{ padding: "1.1rem 1.25rem" }}>
            <div className="skeleton" style={{ height: "0.7rem", width: "40%", marginBottom: "0.6rem" }} />
            <div className="skeleton" style={{ height: "1.1rem", width: "85%", marginBottom: "0.5rem" }} />
            <div className="skeleton" style={{ height: "0.8rem", width: "100%" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function clamp(s: string, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n).trimEnd() + "…" : s;
}
