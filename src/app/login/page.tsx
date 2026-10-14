import { cacheLife } from "next/cache";
import { Fragment } from "react";
import { poppins } from "./font";
import { LoginForm } from "./login-form";
import "./login.css";

export const metadata = { title: "Sign in" };

const COMPANY_LOGOS = [
  { src: "/getmeds-logo.png", alt: "GetMEDS", width: 600, height: 337 },
  { src: "/2mg-logo.png", alt: "2MG Inc.", width: 400, height: 156 },
];

// cacheComponents forbids a bare new Date() during prerender; a daily refresh is plenty for the year.
async function currentYear() {
  "use cache";
  cacheLife("days");
  return new Date().getFullYear();
}

export default async function LoginPage() {
  return (
    <div className={`login-page ${poppins.variable}`}>
      {/* Hero: brand and illustration on the left, headline and form card on the right. */}
      <section className="login-hero">

        <header className="login-hero-topbar">
          {/* Company logos */}
          <div className="login-brand-pair">
            {COMPANY_LOGOS.map((logo, i) => (
              <Fragment key={logo.src}>
                {i > 0 && <span className="login-brand-sep" aria-hidden="true" />}
                {/* eslint-disable-next-line @next/next/no-img-element -- small static logos */}
                <img src={logo.src} width={logo.width} height={logo.height} decoding="async" alt={logo.alt} className="login-brand-logo" />
              </Fragment>
            ))}
          </div>
        </header>

        <div className="login-hero-art" aria-hidden="true" />

        <div className="login-hero-inner">
          <div className="login-hero-copy">
            <h2 className="login-hero-title">
              Company files, <span className="login-hero-title-accent">in one place.</span>
            </h2>
            <p className="login-hero-sub">
              Browse, upload and share the GetMEDS and 2MG files kept in Zoho WorkDrive — no Zoho account needed.
            </p>
          </div>

          <main className="login-card">
            <div className="login-card-body">
              <LoginForm />
            </div>
          </main>
        </div>

        <p className="login-hero-copyright">© {await currentYear()} workdrive.getmeds.ph. All Rights Reserved.</p>
      </section>
    </div>
  );
}
