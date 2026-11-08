/** Page title block: an optional kicker line, the title, a subtitle and actions on the right. */
export default function PageHeader({ kicker, title, subtitle, actions }) {
  return (
    <header className="page-head">
      <div className="page-head-text">
        {kicker && <span className="kicker">{kicker}</span>}
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-sub">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

/** Heading of a section inside a page, with an optional link or button on the right. */
export function SectionHead({ kicker, title, id, children }) {
  return (
    <div className="section-head">
      <div>
        {kicker && <span className="kicker">{kicker}</span>}
        <h2 className="section-title" id={id}>
          {title}
        </h2>
      </div>
      {children}
    </div>
  );
}
