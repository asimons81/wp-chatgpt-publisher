import React, { useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import styles from "./styles.css?inline";
import { callTool, snapshot, subscribe } from "./bridge.js";
import "./types.js";

const styleId = "wpcp-chatgpt-ui-styles";
let style = document.querySelector<HTMLStyleElement>(`#${styleId}`);
if (!style) {
  style = document.createElement("style");
  style.id = styleId;
  document.head.append(style);
}
style.textContent = styles;

type Data = Record<string, unknown>;
const object = (value: unknown): Data =>
  typeof value === "object" && value !== null ? (value as Data) : {};
const text = (value: unknown, fallback = "\u2014") =>
  typeof value === "string" && value.trim() ? value : fallback;
const list = (value: unknown): unknown[] => (Array.isArray(value) ? Array.from(value) : []);
const number = (value: unknown) => (typeof value === "number" ? value : null);
const identifier = (value: unknown) =>
  typeof value === "string" || typeof value === "number" ? String(value) : "";
const label = (value: unknown, fallback = "Unknown") =>
  text(value, fallback)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "good" | "warn" | "danger";
}) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

function Field({ label: fieldLabel, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <dt>{fieldLabel}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Header({ eyebrow, title, status }: { eyebrow: string; title: string; status?: string }) {
  return (
    <header className="header">
      <div className="header-copy">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
      </div>
      {status ? (
        <Badge
          tone={
            status === "publish" || status === "healthy"
              ? "good"
              : status === "error"
                ? "danger"
                : status === "future"
                  ? "warn"
                  : "neutral"
          }
        >
          {label(status)}
        </Badge>
      ) : null}
    </header>
  );
}

function ExternalLink({ href, children, className }: React.ComponentProps<"a">) {
  if (typeof href !== "string") return null;
  const open = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!window.openai?.openExternal) return;
    event.preventDefault();
    void window.openai.openExternal({ href });
  };
  return (
    <a className={className} href={href} rel="noreferrer" target="_blank" onClick={open}>
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

function ErrorCard({ error }: { error: Data }) {
  return (
    <main className="surface surface--error" role="alert" aria-live="assertive">
      <Header
        eyebrow="Connection needs attention"
        title={text(error.message, "The operation could not be completed")}
        status="error"
      />
      <p>{text(error.remediation, "Run the connection diagnostic, then reconnect if needed.")}</p>
      <small>Request {text(error.requestId)}</small>
    </main>
  );
}

function SiteCard({ data }: { data: Data }) {
  const scopes = list(data.scopes);
  const siteUrl = text(data.siteUrl ?? data.url, "");
  return (
    <main className="surface">
      <Header
        eyebrow="Connected WordPress site"
        title={text(data.siteName ?? data.name, "WordPress site")}
        status={text(data.connectionHealth ?? data.health, "connected")}
      />
      <dl className="grid">
        <Field label="Site">
          {siteUrl ? <ExternalLink href={siteUrl}>{siteUrl}</ExternalLink> : "\u2014"}
        </Field>
        <Field label="WordPress">{text(data.wordpressVersion ?? data.version)}</Field>
        <Field label="Signed in as">{text(data.userDisplayName ?? data.user)}</Field>
        <Field label="SEO">{label(data.seoAdapter, "Native")}</Field>
      </dl>
      {scopes.length ? (
        <details className="disclosure">
          <summary>{scopes.length} approved permissions</summary>
          <div className="scope-row">
            {scopes.map((scope) => (
              <Badge key={String(scope)}>{String(scope)}</Badge>
            ))}
          </div>
        </details>
      ) : null}
    </main>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="empty-state">
      <strong>No results</strong>
      <p>{message}</p>
    </div>
  );
}

function SearchResults({ data }: { data: Data }) {
  const items = list(data.items ?? data.results).map(object);
  const total = number(object(data.pagination).total);
  return (
    <main className="surface">
      <Header
        eyebrow={`${items.length}${total !== null ? ` of ${total}` : ""} results`}
        title="WordPress content"
      />
      {items.length ? (
        <div className="results">
          {items.map((item) => (
            <article className="result" key={`${identifier(item.type)}-${identifier(item.id)}`}>
              <div className="result-copy">
                <Badge>{label(item.type, "Content")}</Badge>
                <h2>{text(item.title, "Untitled")}</h2>
                <p>{text(item.excerpt, "No excerpt")}</p>
              </div>
              <div className="result-meta">
                <span>{label(item.status)}</span>
                {number(item.wordCount) !== null ? (
                  <span>{number(item.wordCount)} words</span>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState message="Try a broader search or include another post status." />
      )}
      {object(data.pagination).nextCursor ? (
        <p className="muted">More results are available in WordPress.</p>
      ) : null}
    </main>
  );
}

function MediaResults({ data }: { data: Data }) {
  const items = list(data.items ?? data.results).map(object);
  return (
    <main className="surface">
      <Header eyebrow={`${items.length} images`} title="WordPress media" />
      {items.length ? (
        <div className="media-grid">
          {items.map((item) => (
            <article className="media-item" key={identifier(item.id)}>
              {typeof item.thumbnailUrl === "string" ? (
                <img src={item.thumbnailUrl} alt={text(item.altText, "")} loading="lazy" />
              ) : (
                <div className="media-placeholder" aria-hidden="true" />
              )}
              <div>
                <h2>{text(item.title, "Untitled image")}</h2>
                <p>{text(item.mimeType, "Image")}</p>
                {number(item.width) && number(item.height) ? (
                  <small>
                    {number(item.width)} \u00d7 {number(item.height)} px
                  </small>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState message="No matching images were found in the media library." />
      )}
    </main>
  );
}

function TaxonomyResults({ data }: { data: Data }) {
  const items = list(data.items).map(object);
  const isTaxonomy = items.some((item) => "hierarchical" in item || "postTypes" in item);
  return (
    <main className="surface">
      <Header
        eyebrow={`${items.length} ${isTaxonomy ? "taxonomies" : "terms"}`}
        title={isTaxonomy ? "Content organization" : "WordPress terms"}
      />
      {items.length ? (
        <div className="compact-list">
          {items.map((item) => (
            <article key={identifier(item.id ?? item.name)}>
              <div>
                <h2>{text(item.label ?? item.name, "Untitled")}</h2>
                <p>{text(item.slug ?? item.name)}</p>
              </div>
              {isTaxonomy ? (
                <Badge tone={item.canAssign === false ? "warn" : "good"}>
                  {item.canAssign === false ? "Read only" : "Assignable"}
                </Badge>
              ) : (
                <Badge>{number(item.count) ?? 0} uses</Badge>
              )}
            </article>
          ))}
        </div>
      ) : (
        <EmptyState message="No matching taxonomies or terms were found." />
      )}
    </main>
  );
}

function SeoCard({ data }: { data: Data }) {
  const metadata = object(data.metadata);
  const support = object(data.support);
  const fields: Array<[string, unknown]> = [
    ["SEO title", metadata.title],
    ["Description", metadata.description],
    ["Focus keyword", metadata.focusKeyword],
    ["Canonical URL", metadata.canonicalUrl],
    ["Robots", metadata.robots],
  ];
  const supported = Object.values(support).filter(Boolean).length;
  return (
    <main className="surface">
      <Header eyebrow={`${label(data.provider, "Native")} SEO`} title="Search metadata" />
      <dl className="stacked-fields">
        {fields.map(([fieldLabel, value]) => (
          <Field key={fieldLabel} label={fieldLabel}>
            {text(value, "Not set")}
          </Field>
        ))}
      </dl>
      {Object.keys(support).length ? (
        <p className="muted">
          This provider supports {supported} of {Object.keys(support).length} normalized fields.
        </p>
      ) : null}
    </main>
  );
}

function ReviewCard({ data }: { data: Data }) {
  const review = object(data.review ?? data);
  const seo = object(review.seo);
  const featured = object(review.featuredImage);
  const previewUrl = text(review.previewUrl, "");
  return (
    <main className="surface">
      <Header
        eyebrow="Editorial review"
        title={text(review.title, "Untitled draft")}
        status={text(review.status, "draft")}
      />
      <dl className="grid">
        <Field label="Post type">{label(review.postType, "Post")}</Field>
        <Field label="Author">{text(review.author)}</Field>
        <Field label="Slug">{text(review.slug)}</Field>
        <Field label="Word count">{number(review.wordCount) ?? 0}</Field>
        <Field label="Categories">{list(review.categories).join(", ") || "None"}</Field>
        <Field label="Tags">{list(review.tags).join(", ") || "None"}</Field>
        <Field label="Featured image">
          {text(
            featured.title,
            identifier(featured.id) ? `Media ${identifier(featured.id)}` : "Not set",
          )}
        </Field>
        <Field label="SEO title">{text(seo.title, "Not set")}</Field>
      </dl>
      {previewUrl ? (
        <p className="review-link">
          <ExternalLink href={previewUrl}>Open WordPress preview</ExternalLink>
        </p>
      ) : null}
      {list(review.warnings).length ? (
        <div className="notice" role="note">
          <strong>Before publishing</strong>
          <ul>
            {list(review.warnings).map((warning) => (
              <li key={String(warning)}>{String(warning)}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <Confirmation data={data} review={review} />
    </main>
  );
}

function Confirmation({ data, review }: { data: Data; review: Data }) {
  const token = data.confirmationToken;
  const action = data.action;
  const [state, setState] = React.useState<"ready" | "working" | "cancelled" | "failed">("ready");
  if (typeof token !== "string" || typeof action !== "string") return null;
  const tool =
    action === "publish"
      ? "wordpress_publish_post"
      : action === "schedule"
        ? "wordpress_schedule_post"
        : action === "edit_published"
          ? "wordpress_update_published_content"
          : "wordpress_set_featured_image";
  const confirm = async () => {
    setState("working");
    const base: Data = {
      contentId: number(review.id ?? review.contentId),
      expectedVersion: text(review.version),
      confirmationToken: token,
      idempotencyKey: crypto.randomUUID(),
    };
    if (action === "schedule") {
      base.publishAt = data.publishAt ?? review.publishAt;
      base.siteTimezone = review.siteTimezone;
    }
    const result = await callTool(tool, base);
    if (!result) setState("failed");
  };
  if (state === "cancelled")
    return (
      <div className="cancelled" role="status">
        Action cancelled. Nothing changed.
      </div>
    );
  return (
    <div className="actions" aria-live="polite">
      <button
        className="button button--primary"
        disabled={state === "working"}
        onClick={() => void confirm()}
      >
        {state === "working" ? "Working\u2026" : `Confirm ${label(action).toLowerCase()}`}
      </button>
      <button
        className="button"
        disabled={state === "working"}
        onClick={() => setState("cancelled")}
      >
        Cancel
      </button>
      <p className="muted">This confirmation expires shortly and can be used only once.</p>
      {state === "failed" ? (
        <p className="inline-error" role="alert">
          WordPress did not respond. Review the connection and try again.
        </p>
      ) : null}
    </div>
  );
}

function WriteResult({ data }: { data: Data }) {
  const changed = list(data.changedFields);
  const item = object(data.object);
  return (
    <main className="surface" aria-live="polite">
      <Header
        eyebrow="WordPress updated"
        title={`${label(item.type, "Content")} ${identifier(item.id)}`.trim()}
        status={text(data.status)}
      />
      <p>{changed.length ? `Changed ${changed.join(", ")}.` : "The operation completed."}</p>
      {list(data.warnings).length ? (
        <div className="notice" role="note">
          <strong>Completed with notes</strong>
          <ul>
            {list(data.warnings).map((warning) => (
              <li key={String(warning)}>{String(warning)}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="actions">
        {typeof data.previewUrl === "string" ? (
          <ExternalLink className="button button--primary" href={data.previewUrl}>
            Open preview
          </ExternalLink>
        ) : null}
        {typeof data.publicUrl === "string" ? (
          <ExternalLink className="button button--primary" href={data.publicUrl}>
            View published post
          </ExternalLink>
        ) : null}
        {typeof data.editUrl === "string" ? (
          <ExternalLink className="button" href={data.editUrl}>
            Open editor
          </ExternalLink>
        ) : null}
      </div>
      {data.auditEventId ? <small>Audit event {text(data.auditEventId)}</small> : null}
    </main>
  );
}

function EmptyCard() {
  return (
    <main className="surface surface--empty" aria-live="polite">
      <Header eyebrow="Editorial Publisher for ChatGPT" title="Ready for WordPress" />
      <p>Run a WordPress tool to review its structured result here.</p>
    </main>
  );
}

function GenericCard({ data }: { data: Data }) {
  return (
    <main className="surface">
      <Header eyebrow="Editorial Publisher for ChatGPT" title="WordPress result" />
      <details className="disclosure disclosure--result">
        <summary>View structured result</summary>
        <pre>{JSON.stringify(data, null, 2)}</pre>
      </details>
    </main>
  );
}

function App() {
  const value = useSyncExternalStore(subscribe, snapshot, snapshot);
  if (value === undefined || value === null) return <EmptyCard />;
  const data = object(value);
  const items = list(data.items ?? data.results).map(object);
  if (data.error) return <ErrorCard error={object(data.error)} />;
  if (data.siteName || data.connectionHealth) return <SiteCard data={data} />;
  if (data.provider && data.metadata) return <SeoCard data={data} />;
  if (items.some((item) => "mimeType" in item || "thumbnailUrl" in item))
    return <MediaResults data={data} />;
  if (
    items.length > 0 &&
    items.every(
      (item) =>
        ("name" in item || "label" in item) &&
        ("hierarchical" in item || "postTypes" in item || "slug" in item),
    )
  )
    return <TaxonomyResults data={data} />;
  if (Array.isArray(data.items) || Array.isArray(data.results))
    return <SearchResults data={data} />;
  if (data.review || data.wordCount || data.confirmationToken) return <ReviewCard data={data} />;
  if (data.auditEventId || data.changedFields) return <WriteResult data={data} />;
  if (!Object.keys(data).length) return <EmptyCard />;
  return <GenericCard data={data} />;
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing application root");
const reactRoot = root.__wpcpReactRoot ?? createRoot(root);
root.__wpcpReactRoot = reactRoot;
reactRoot.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
