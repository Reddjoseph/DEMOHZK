import { useState } from "react";
import StakingApp from "./components/StakingApp";
import "./App.css";

const SECTIONS = ["Games", "Overview", "HOT", "Staking"];

export default function App() {
  // Default page: HOT
  const [active, setActive] = useState("HOT");

  return (
    <div className="site-root">
      <div className="site-layout">
        {/* LEFT SIDEBAR NAV */}
        <aside className="site-sidebar">
          <div className="site-brand">
            <div className="site-brand-mark">HZK</div>
            <div className="site-brand-text">
              <span className="brand-main">Hanzenko</span>
              <span className="brand-sub">Gaming Hub</span>
            </div>
          </div>

          <nav className="site-nav-vertical">
            {SECTIONS.map((sec) => (
              <button
                key={sec}
                type="button"
                className={
                  "site-nav-item" + (active === sec ? " active" : "")
                }
                onClick={() => setActive(sec)}
              >
                <span className="nav-dot" />
                <span>{sec}</span>
              </button>
            ))}
          </nav>

          <div className="site-sidebar-footer">
            <p className="sidebar-label">Network</p>
            <p className="sidebar-network">Devnet • HZK</p>
            <p className="sidebar-tip">
              Switch to <span>Mainnet</span> when ready.
            </p>
          </div>
        </aside>

        {/* MAIN CONTENT AREA */}
        <main className="site-main">
          {/* Global gaming background */}
          <div className="site-main-bg" />

          {active === "Staking" && <StakingApp />}

          {active === "Games" && <GamesPage />}

          {active === "Overview" && <OverviewPage />}

          {active === "HOT" && <HotPage />}
        </main>
      </div>
    </div>
  );
}

/* --------- PAGES --------- */

function GamesPage() {
  return (
    <div className="page-shell hzk-section-animated hzk-section-animated--games">
      {/* Banner hero (same style as Overview / HOT) */}
      <section className="page-hero-banner games-banner">
        <div className="page-hero-overlay">
          <p className="page-tag">Games</p>
          <h1 className="page-title">HZK Arcade</h1>
          <p className="page-subtitle">
            A curated arena for Hanzenko-powered experiences. Mini-games,
            quests, and tournaments built around your HZK identity.
          </p>
        </div>
      </section>

      {/* Featured + game cards in one grid */}
      <section className="page-grid page-grid-games">
        <FeaturedModeCard />

        <GameCard
          title="Fox Rush"
          status="In concept"
          desc="Fast-paced runner featuring Fox Intelligence. Speed, precision, and global leaderboards."
        />
        <GameCard
          title="Tiger Arena"
          status="Planned"
          desc="Brawler arena channeling Tiger Strength. 1v1 duels, team modes, and seasonal tournaments."
        />
        <GameCard
          title="Dragon Forge"
          status="Prototype"
          desc="Crafting & upgrades powered by Dragon Innovation. Forge gear that syncs with staking perks."
        />
      </section>
    </div>
  );
}

function FeaturedModeCard() {
  return (
    <article className="featured-game-card glow-card glow-card-video">
      <div className="featured-header-row">
        <span className="featured-pill">Featured</span>
        <span className="featured-tag">Arcade mode</span>
      </div>

      <div className="glow-media">
        {/* Placeholder looping video – replace src with your real clip later */}
        <video
          className="glow-video"
          src="/videos/hzk-featured-placeholder.mp4"
          autoPlay
          muted
          loop
          playsInline
        />
        <div className="glow-media-overlay">
          <span className="glow-media-pill">Preview loop</span>
        </div>
      </div>

      <div className="glow-content">
        <p className="glow-label">Featured mode</p>
        <h2 className="glow-title">HZK Battle Trials</h2>
        <p className="glow-text">
          Seasonal ladders, on-chain rewards, and ranked brackets where your HZK
          really matters. Perfect for testing competitive game loops powered by
          staking perks and on-chain progression.
        </p>
        <div className="glow-pills">
          <span>Ranked</span>
          <span>PvP</span>
          <span>HZK Rewards</span>
        </div>
      </div>
    </article>
  );
}

function GameCard({ title, status, desc }) {
  return (
    <article className="game-card">
      <div className="game-card-header">
        <h3>{title}</h3>
        <span className="game-status">{status}</span>
      </div>
      <p className="game-desc">{desc}</p>
      <div className="game-footer">
        <span className="pill">Coming soon</span>
        <span className="pill pill-outline">HZK powered</span>
      </div>
    </article>
  );
}

function OverviewPage() {
  return (
    <div className="page-shell hzk-section-animated hzk-section-animated--overview">
      {/* Banner hero with background image */}
      <section className="page-hero-banner overview-banner">
        <div className="page-hero-overlay">
          <p className="page-tag">Overview</p>
          <h1 className="page-title">Ecosystem snapshot</h1>
          <p className="page-subtitle">
            High-level picture of Hanzenko: token, staking engine, and the
            upcoming gaming universe.
          </p>
        </div>
      </section>

      <section className="overview-grid">
        <div className="overview-card">
          <p className="overview-label">HZK Identity</p>
          <h2 className="overview-value">Fox • Tiger • Dragon</h2>
          <p className="overview-text">
            Intelligence, strength, and innovation – the three spirits of
            Hanzenko guiding design, tokenomics, and gameplay.
          </p>
        </div>
        <div className="overview-card">
          <p className="overview-label">Core utilities</p>
          <ul className="overview-list">
            <li>Stake HZK to earn rewards and unlock in-game boosts.</li>
            <li>Use HZK as an in-game currency across partnered titles.</li>
            <li>Access gated arenas, events, and cosmetic drops.</li>
          </ul>
        </div>
        <div className="overview-card">
          <p className="overview-label">Roadmap vibes</p>
          <ul className="overview-list">
            <li>Ship staking to mainnet with tuned rewards.</li>
            <li>Release first playable HZK mini-game.</li>
            <li>Season-based reward tracks and achievements.</li>
          </ul>
        </div>
      </section>
    </div>
  );
}

function HotPage() {
  return (
    <div className="page-shell hzk-section-animated hzk-section-animated--hot">
      {/* Banner hero with background image */}
      <section className="page-hero-banner hot-banner">
        <div className="page-hero-overlay">
          <p className="page-tag tag-hot">HOT</p>
          <h1 className="page-title">News & Updates</h1>
          <p className="page-subtitle">
            Announcements, patch notes, and early alpha. Later you can hook this
            into Twitter, Discord, or a CMS.
          </p>
        </div>
      </section>

      <section className="hot-feed">
        <article className="hot-card">
          <div className="hot-header">
            <span className="hot-pill">Devnet</span>
            <span className="hot-date">Live</span>
          </div>
          <h2 className="hot-title">HZK Staking is live on Devnet</h2>
          <p className="hot-text">
            Connect your wallet, stake test HZK, and simulate the full staking
            journey before going mainnet. This is the playground for tuning.
          </p>
        </article>

        <article className="hot-card">
          <div className="hot-header">
            <span className="hot-pill hot-pill-secondary">Arcade</span>
            <span className="hot-date">Soon™</span>
          </div>
          <h2 className="hot-title">First HZK mini-game in development</h2>
          <p className="hot-text">
            Prototyping fast-paced arcade experiences that plug directly into
            your HZK wallet and staking position.
          </p>
        </article>

        <article className="hot-card">
          <div className="hot-header">
            <span className="hot-pill hot-pill-outline">Community</span>
            <span className="hot-date">TBA</span>
          </div>
          <h2 className="hot-title">Founders’ leaderboard & achievements</h2>
          <p className="hot-text">
            Track early supporters, reward consistent stakers, and showcase
            on-chain achievements in public profiles.
          </p>
        </article>
      </section>
    </div>
  );
}
