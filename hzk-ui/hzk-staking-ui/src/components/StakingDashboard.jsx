import React, { useState } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import "./StakingDashboard.css";

const TABS = ["Overview", "Stake", "Unstake", "History"];

export default function StakingDashboard({
  walletAddress,
  network = "devnet",
  hzkBalance = 0,
  stakedBalance = 0,
  pendingRewards = 0,
  apr = 12,
  status,
  onStake,
  onUnstake,
  onClaimRewards,
  onDisconnect,
}) {
  const [activeTab, setActiveTab] = useState("Overview");
  const [stakeAmount, setStakeAmount] = useState("");
  const [unstakeAmount, setUnstakeAmount] = useState("");
  const [stakeError, setStakeError] = useState("");
  const [unstakeError, setUnstakeError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingAction, setLoadingAction] = useState(null); // 'stake' | 'unstake' | 'claim' | null
  const [localStatus, setLocalStatus] = useState(null);
  const [history, setHistory] = useState([]); // per-session activity

  // Toasts: success / error notifications
  const [toasts, setToasts] = useState([]);

  const isWalletConnected = !!walletAddress;

  const shortAddress =
    walletAddress && walletAddress.length > 10
      ? walletAddress.slice(0, 4) + "..." + walletAddress.slice(-4)
      : walletAddress || "Not connected";

  const showStatus = localStatus || status || "Idle";

  // ---------- toast helpers ----------

  function showToast(type, message) {
    const id =
      Date.now().toString(36) + Math.random().toString(16).slice(2);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }

  function hideToast(id) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  // ---------- helpers for amount inputs ----------

  function clampToBalance(num, max) {
    if (!Number.isFinite(num)) return 0;
    let v = num;
    if (v < 0) v = 0;
    if (max > 0 && v > max) v = max;
    return v;
  }

  function handleStakeInputChange(e) {
    const raw = e.target.value.replace(",", ".");

    if (raw === "") {
      setStakeAmount("");
      setStakeError("");
      return;
    }

    // allow only digits and a single dot
    if (!/^\d*\.?\d*$/.test(raw)) {
      // ignore invalid keystroke
      return;
    }

    const max = Number(hzkBalance) || 0;
    const num = Number(raw);
    if (!Number.isFinite(num)) {
      setStakeError("Enter a valid number.");
      return;
    }

    const clamped = clampToBalance(num, max);
    if (clamped <= 0) {
      setStakeAmount("");
      setStakeError("");
      return;
    }

    const rounded = Math.floor(clamped * 1e4) / 1e4;
    setStakeAmount(rounded.toString());
    setStakeError("");
  }

  function handleUnstakeInputChange(e) {
    const raw = e.target.value.replace(",", ".");

    if (raw === "") {
      setUnstakeAmount("");
      setUnstakeError("");
      return;
    }

    if (!/^\d*\.?\d*$/.test(raw)) {
      return;
    }

    const max = Number(stakedBalance) || 0;
    const num = Number(raw);
    if (!Number.isFinite(num)) {
      setUnstakeError("Enter a valid number.");
      return;
    }

    const clamped = clampToBalance(num, max);
    if (clamped <= 0) {
      setUnstakeAmount("");
      setUnstakeError("");
      return;
    }

    const rounded = Math.floor(clamped * 1e4) / 1e4;
    setUnstakeAmount(rounded.toString());
    setUnstakeError("");
  }

  function adjustStakeAmount(direction) {
    const max = Number(hzkBalance) || 0;
    if (max <= 0) return;

    const step = Math.max(max / 20, 0.0001); // ~5% of balance or tiny
    const current = Number(stakeAmount) || 0;

    let next =
      direction === "up" ? current + step : current - step;

    next = clampToBalance(next, max);

    if (next <= 0) {
      setStakeAmount("");
      setStakeError("");
      return;
    }

    const rounded = Math.floor(next * 1e4) / 1e4;
    setStakeAmount(rounded.toString());
    setStakeError("");
  }

  function adjustUnstakeAmount(direction) {
    const max = Number(stakedBalance) || 0;
    if (max <= 0) return;

    const step = Math.max(max / 20, 0.0001);
    const current = Number(unstakeAmount) || 0;

    let next =
      direction === "up" ? current + step : current - step;

    next = clampToBalance(next, max);

    if (next <= 0) {
      setUnstakeAmount("");
      setUnstakeError("");
      return;
    }

    const rounded = Math.floor(next * 1e4) / 1e4;
    setUnstakeAmount(rounded.toString());
    setUnstakeError("");
  }

  function handleStakeMax() {
    const max = Number(hzkBalance) || 0;
    if (max <= 0) {
      setStakeAmount("");
      setStakeError("");
      return;
    }
    const rounded = Math.floor(max * 1e4) / 1e4;
    setStakeAmount(rounded.toString());
    setStakeError("");
  }

  function handleUnstakeMax() {
    const max = Number(stakedBalance) || 0;
    if (max <= 0) {
      setUnstakeAmount("");
      setUnstakeError("");
      return;
    }
    const rounded = Math.floor(max * 1e4) / 1e4;
    setUnstakeAmount(rounded.toString());
    setUnstakeError("");
  }

  // ---------- history helpers ----------

  function addHistoryEntry(entry) {
    const id =
      Date.now().toString(36) + Math.random().toString(16).slice(2);
    const timestamp = new Date().toISOString();
    setHistory((prev) =>
      [{ id, timestamp, ...entry }, ...prev].slice(0, 30) // keep last 30
    );
  }

  function formatTimestamp(ts) {
    try {
      const d = new Date(ts);
      return d.toLocaleString();
    } catch {
      return ts;
    }
  }

  // ---------- actions ----------

  async function handleStake() {
    if (!isWalletConnected) {
      const msg = "Connect your wallet to stake.";
      setLocalStatus(msg);
      setStakeError("Connect your wallet first.");
      showToast("error", msg);
      return;
    }
    const max = Number(hzkBalance) || 0;
    const amount = Number(stakeAmount);

    if (!Number.isFinite(amount) || amount <= 0) {
      const msg = "Enter a valid amount to stake.";
      setLocalStatus(msg);
      setStakeError("Enter an amount greater than 0.");
      showToast("error", msg);
      return;
    }
    if (max > 0 && amount > max + 1e-9) {
      const msg = "Stake amount exceeds your wallet HZK balance.";
      setLocalStatus(msg);
      setStakeError(msg);
      showToast("error", msg);
      return;
    }
    if (!onStake) return;

    try {
      setIsSubmitting(true);
      setLoadingAction("stake");
      setLocalStatus("Sending stake transaction...");
      const result = await onStake(amount);
      const successMsg = "Stake transaction submitted.";
      setLocalStatus(successMsg);
      setStakeAmount("");
      setStakeError("");

      addHistoryEntry({
        type: "stake",
        amount,
        extra: typeof result === "string" ? result : null,
      });

      showToast("success", `Staked ${amount} HZK`);
    } catch (err) {
      console.error(err);
      const msg = err?.message || "Failed to stake.";
      setLocalStatus(msg);
      setStakeError(msg);

      addHistoryEntry({
        type: "stake-error",
        amount: Number(stakeAmount) || 0,
        extra: msg,
      });

      showToast("error", msg);
    } finally {
      setIsSubmitting(false);
      setLoadingAction(null);
    }
  }

  async function handleUnstake() {
    if (!isWalletConnected) {
      const msg = "Connect your wallet to unstake.";
      setLocalStatus(msg);
      setUnstakeError("Connect your wallet first.");
      showToast("error", msg);
      return;
    }
    const max = Number(stakedBalance) || 0;
    const amount = Number(unstakeAmount);

    if (!Number.isFinite(amount) || amount <= 0) {
      const msg = "Enter a valid amount to unstake.";
      setLocalStatus(msg);
      setUnstakeError("Enter an amount greater than 0.");
      showToast("error", msg);
      return;
    }
    if (max > 0 && amount > max + 1e-9) {
      const msg = "Unstake amount exceeds your staked HZK balance.";
      setLocalStatus(msg);
      setUnstakeError(msg);
      showToast("error", msg);
      return;
    }
    if (!onUnstake) return;

    try {
      setIsSubmitting(true);
      setLoadingAction("unstake");
      setLocalStatus("Sending unstake transaction...");
      const result = await onUnstake(amount);
      const successMsg = "Unstake transaction submitted.";
      setLocalStatus(successMsg);
      setUnstakeAmount("");
      setUnstakeError("");

      addHistoryEntry({
        type: "unstake",
        amount,
        extra: typeof result === "string" ? result : null,
      });

      showToast("success", `Unstaked ${amount} HZK`);
    } catch (err) {
      console.error(err);
      const msg = err?.message || "Failed to unstake.";
      setLocalStatus(msg);
      setUnstakeError(msg);

      addHistoryEntry({
        type: "unstake-error",
        amount: Number(unstakeAmount) || 0,
        extra: msg,
      });

      showToast("error", msg);
    } finally {
      setIsSubmitting(false);
      setLoadingAction(null);
    }
  }

  async function handleClaim() {
    if (!isWalletConnected) {
      const msg = "Connect your wallet to claim rewards.";
      setLocalStatus(msg);
      showToast("error", msg);
      return;
    }
    if (!onClaimRewards) return;
    try {
      setIsSubmitting(true);
      setLoadingAction("claim");
      setLocalStatus("Sending claim transaction...");
      const result = await onClaimRewards();
      const successMsg = "Rewards claim submitted.";
      setLocalStatus(successMsg);

      addHistoryEntry({
        type: "claim",
        amount: Number(pendingRewards) || 0,
        extra: typeof result === "string" ? result : null,
      });

      showToast("success", "Rewards claim submitted.");
    } catch (err) {
      console.error(err);
      const msg = err?.message || "Failed to claim rewards.";
      setLocalStatus(msg);

      addHistoryEntry({
        type: "claim-error",
        amount: Number(pendingRewards) || 0,
        extra: msg,
      });

      showToast("error", msg);
    } finally {
      setIsSubmitting(false);
      setLoadingAction(null);
    }
  }

  function handleCopyAddress() {
    if (!walletAddress || !navigator.clipboard) return;
    navigator.clipboard.writeText(walletAddress);
    const msg = "Wallet address copied.";
    setLocalStatus(msg);
    showToast("success", msg);
  }

  const total = hzkBalance + stakedBalance;
  const stakedPct = total > 0 ? (stakedBalance / total) * 100 : 0;

  return (
    <div className="staking-root">
      <div className="staking-wrapper">
        {/* Header */}
        <header className="staking-header">
          <div className="staking-header-left">
            <p className="staking-eyebrow">Hanzenko • HZK</p>
            <h1 className="staking-title">HZK Staking Dashboard</h1>
            <p className="staking-subtitle">
              Stake your HZK to earn passive rewards. Simple, transparent, and
              non-custodial.
            </p>
          </div>

          <div className="staking-header-right">
            <div className="staking-network-row">
              <span
                className={
                  "staking-network-badge " +
                  (network === "mainnet-beta"
                    ? "staking-network-mainnet"
                    : "staking-network-devnet")
                }
              >
                <span className="staking-network-dot" />
                {network === "mainnet-beta" ? "Mainnet" : "Devnet"}
              </span>
            </div>

            <div className="staking-wallet-btn-row">
              {/* upgraded connect wallet button wrapper */}
              <div className="wallet-btn-wrap">
                <WalletMultiButton />
              </div>
            </div>

            <div className="staking-address-pill">
              <span className="staking-address-text">{shortAddress}</span>
              {isWalletConnected && (
                <>
                  <button
                    className="staking-pill-button"
                    type="button"
                    onClick={handleCopyAddress}
                  >
                    Copy
                  </button>
                  {onDisconnect && (
                    <button
                      className="staking-pill-button staking-pill-outline"
                      type="button"
                      onClick={onDisconnect}
                    >
                      Disconnect
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </header>

        {/* Main card */}
        <main className="staking-card">
          {/* Top row */}
          <section className="staking-top">
            <div className="staking-stats-grid">
              <StatCard label="Wallet HZK" value={hzkBalance} />
              <StatCard label="Staked HZK" value={stakedBalance} />
              <StatCard label="Pending Rewards" value={pendingRewards} />
              <StatCard label="Estimated APR" value={apr} suffix="%" />
            </div>

            <div className="staking-rewards-card">
              <div>
                <p className="staking-rewards-label">Rewards</p>
                <p className="staking-rewards-main">
                  Ready to claim:{" "}
                  <span className="staking-rewards-amount">
                    {pendingRewards.toLocaleString(undefined, {
                      maximumFractionDigits: 4,
                    })}{" "}
                    HZK
                  </span>
                </p>
                <p className="staking-rewards-sub">
                  Rewards accumulate continuously while your HZK is staked.
                </p>
              </div>
              <button
                type="button"
                className={
                  "staking-btn-primary small" +
                  (loadingAction === "claim" ? " staking-btn-loading" : "")
                }
                disabled={pendingRewards <= 0 || isSubmitting || !onClaimRewards}
                onClick={handleClaim}
              >
                <span>
                  {loadingAction === "claim" ? "Claiming..." : "Claim rewards"}
                </span>
              </button>
            </div>
          </section>

          {/* Tabs */}
          <nav className="staking-tabs">
            {TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                className={
                  "staking-tab-btn" +
                  (activeTab === tab ? " staking-tab-active" : "")
                }
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </nav>

          {/* Content + side */}
          <section className="staking-main-row">
            {/* Left column: tabs */}
            <div className="staking-main-col">
              {activeTab === "Overview" && (
                <div className="staking-panel">
                  <h2 className="staking-panel-title">Your portfolio</h2>
                  <p className="staking-panel-text">
                    Overview of how your HZK is allocated between wallet and
                    staked position.
                  </p>

                  <div className="staking-bar-row">
                    <span className="staking-bar-label">
                      Staked HZK: {stakedBalance.toLocaleString()}
                    </span>
                    <span className="staking-bar-label right">
                      {stakedPct.toFixed(1)}% of total
                    </span>
                  </div>
                  <div className="staking-bar-track">
                    <div
                      className="staking-bar-fill"
                      style={{ width: stakedPct + "%" }}
                    />
                  </div>

                  <div className="staking-portfolio-footer">
                    <p>
                      Total HZK:{" "}
                      <span className="em">
                        {total.toLocaleString(undefined, {
                          maximumFractionDigits: 4,
                        })}
                      </span>
                    </p>
                    <p>
                      Estimated APR:{" "}
                      <span className="em apr">{apr}%</span>
                    </p>
                  </div>

                  <div className="staking-quick-actions">
                    <button
                      type="button"
                      className="staking-btn-primary"
                      onClick={() => setActiveTab("Stake")}
                      disabled={!isWalletConnected}
                    >
                      Stake HZK
                    </button>
                    <button
                      type="button"
                      className="staking-btn-secondary"
                      onClick={() => setActiveTab("Unstake")}
                      disabled={!isWalletConnected}
                    >
                      Unstake HZK
                    </button>
                  </div>
                  {!isWalletConnected && (
                    <p className="staking-help-text warning">
                      Connect your wallet to enable staking actions.
                    </p>
                  )}
                </div>
              )}

              {activeTab === "Stake" && (
                <div className="staking-panel">
                  <div className="staking-panel-header">
                    <h2 className="staking-panel-title">Stake HZK</h2>
                    <span className="staking-chip">Long-term</span>
                  </div>
                  <p className="staking-panel-text">
                    Lock your HZK tokens to start earning rewards. You can
                    unstake later according to the program rules.
                  </p>

                  <div className="staking-field">
                    <label className="staking-field-label">
                      Amount to stake
                    </label>
                    <div className="staking-field-row staking-field-row-number">
                      <div className="staking-amount-input-wrapper">
                        <input
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          spellCheck="false"
                          value={stakeAmount}
                          onChange={handleStakeInputChange}
                          className={
                            "staking-input" +
                            (stakeError ? " staking-input-error" : "")
                          }
                          placeholder="0.0"
                        />
                        <span className="staking-amount-suffix">HZK</span>
                        <div className="staking-amount-stepper">
                          <button
                            type="button"
                            className="staking-amount-step-btn up"
                            onClick={() => adjustStakeAmount("up")}
                            disabled={
                              !isWalletConnected ||
                              isSubmitting ||
                              hzkBalance <= 0
                            }
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            className="staking-amount-step-btn down"
                            onClick={() => adjustStakeAmount("down")}
                            disabled={
                              !isWalletConnected ||
                              isSubmitting ||
                              hzkBalance <= 0
                            }
                          >
                            ▼
                          </button>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="staking-btn-secondary small"
                        onClick={handleStakeMax}
                        disabled={
                          !isWalletConnected ||
                          isSubmitting ||
                          hzkBalance <= 0
                        }
                      >
                        MAX
                      </button>
                    </div>
                    <p className="staking-field-help">
                      Wallet balance:{" "}
                      {hzkBalance.toLocaleString(undefined, {
                        maximumFractionDigits: 4,
                      })}{" "}
                      HZK
                    </p>
                    {stakeError && (
                      <p className="staking-field-error">{stakeError}</p>
                    )}
                  </div>

                  <button
                    type="button"
                    className={
                      "staking-btn-primary" +
                      (loadingAction === "stake" ? " staking-btn-loading" : "")
                    }
                    disabled={isSubmitting || !onStake}
                    onClick={handleStake}
                  >
                    <span>
                      {loadingAction === "stake" ? "Staking..." : "Stake HZK"}
                    </span>
                  </button>
                </div>
              )}

              {activeTab === "Unstake" && (
                <div className="staking-panel">
                  <div className="staking-panel-header">
                    <h2 className="staking-panel-title">Unstake HZK</h2>
                    <span className="staking-chip">Withdraw</span>
                  </div>
                  <p className="staking-panel-text">
                    Withdraw your staked HZK back to your wallet.
                  </p>

                  <div className="staking-field">
                    <label className="staking-field-label">
                      Amount to unstake
                    </label>
                    <div className="staking-field-row staking-field-row-number">
                      <div className="staking-amount-input-wrapper">
                        <input
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          spellCheck="false"
                          value={unstakeAmount}
                          onChange={handleUnstakeInputChange}
                          className={
                            "staking-input" +
                            (unstakeError ? " staking-input-error" : "")
                          }
                          placeholder="0.0"
                        />
                        <span className="staking-amount-suffix">HZK</span>
                        <div className="staking-amount-stepper">
                          <button
                            type="button"
                            className="staking-amount-step-btn up"
                            onClick={() => adjustUnstakeAmount("up")}
                            disabled={
                              !isWalletConnected ||
                              isSubmitting ||
                              stakedBalance <= 0
                            }
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            className="staking-amount-step-btn down"
                            onClick={() => adjustUnstakeAmount("down")}
                            disabled={
                              !isWalletConnected ||
                              isSubmitting ||
                              stakedBalance <= 0
                            }
                          >
                            ▼
                          </button>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="staking-btn-secondary small"
                        onClick={handleUnstakeMax}
                        disabled={
                          !isWalletConnected ||
                          isSubmitting ||
                          stakedBalance <= 0
                        }
                      >
                        MAX
                      </button>
                    </div>
                    <p className="staking-field-help">
                      Staked balance:{" "}
                      {stakedBalance.toLocaleString(undefined, {
                        maximumFractionDigits: 4,
                      })}{" "}
                      HZK
                    </p>
                    {unstakeError && (
                      <p className="staking-field-error">{unstakeError}</p>
                    )}
                  </div>

                  <button
                    type="button"
                    className={
                      "staking-btn-danger" +
                      (loadingAction === "unstake"
                        ? " staking-btn-loading"
                        : "")
                    }
                    disabled={isSubmitting || !onUnstake}
                    onClick={handleUnstake}
                  >
                    <span>
                      {loadingAction === "unstake"
                        ? "Unstaking..."
                        : "Unstake HZK"}
                    </span>
                  </button>
                </div>
              )}

              {activeTab === "History" && (
                <div className="staking-panel">
                  <h2 className="staking-panel-title">Activity history</h2>
                  <p className="staking-panel-text">
                    Recent staking actions in this session. This history clears
                    when you reload the page.
                  </p>

                  {history.length === 0 ? (
                    <div className="staking-empty-box">
                      <p className="staking-empty-title">No activity yet</p>
                      <p className="staking-empty-text">
                        Stake, unstake, or claim rewards and your latest actions
                        will show up here.
                      </p>
                    </div>
                  ) : (
                    <ul className="staking-history-list">
                      {history.map((item) => (
                        <li key={item.id} className="staking-history-item">
                          <div className="staking-history-main">
                            <span
                              className={
                                "staking-history-pill " +
                                (item.type.includes("error")
                                  ? "error"
                                  : item.type === "claim"
                                  ? "claim"
                                  : item.type === "stake"
                                  ? "stake"
                                  : "unstake")
                              }
                            >
                              {item.type === "stake" && "Stake"}
                              {item.type === "unstake" && "Unstake"}
                              {item.type === "claim" && "Claim"}
                              {item.type === "stake-error" && "Stake error"}
                              {item.type === "unstake-error" &&
                                "Unstake error"}
                              {item.type === "claim-error" && "Claim error"}
                            </span>
                            <div className="staking-history-text">
                              <span className="staking-history-amount">
                                {Number(item.amount || 0).toLocaleString(
                                  undefined,
                                  { maximumFractionDigits: 4 }
                                )}{" "}
                                HZK
                              </span>
                              {item.extra && (
                                <span className="staking-history-extra">
                                  {item.extra}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="staking-history-meta">
                            {formatTimestamp(item.timestamp)}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {/* Right column: status & helper */}
            <aside className="staking-side-col">
              <div className="staking-status-card">
                <h3 className="staking-status-title">Status</h3>
                <div className="staking-status-box">{showStatus}</div>
              </div>

              {!isWalletConnected ? (
                <div className="staking-helper-card warning">
                  <h3 className="staking-helper-title">
                    Wallet not connected
                  </h3>
                  <p className="staking-helper-text">
                    Connect your wallet using the button at the top right to
                    start staking HZK.
                  </p>
                  <ul className="staking-helper-list">
                    <li>Switch your wallet to Devnet.</li>
                    <li>Ensure you have some HZK test tokens.</li>
                    <li>Return here to stake, unstake, and claim.</li>
                  </ul>
                </div>
              ) : (
                <div className="staking-helper-card">
                  <h3 className="staking-helper-title">Quick summary</h3>
                  <dl className="staking-summary-list">
                    <div className="staking-summary-row">
                      <dt>Wallet HZK</dt>
                      <dd>
                        {hzkBalance.toLocaleString(undefined, {
                          maximumFractionDigits: 4,
                        })}{" "}
                        HZK
                      </dd>
                    </div>
                    <div className="staking-summary-row">
                      <dt>Staked HZK</dt>
                      <dd>
                        {stakedBalance.toLocaleString(undefined, {
                          maximumFractionDigits: 4,
                        })}{" "}
                        HZK
                      </dd>
                    </div>
                    <div className="staking-summary-row">
                      <dt>Pending rewards</dt>
                      <dd>
                        {pendingRewards.toLocaleString(undefined, {
                          maximumFractionDigits: 4,
                        })}{" "}
                        HZK
                      </dd>
                    </div>
                    <div className="staking-summary-row">
                      <dt>APR</dt>
                      <dd>{apr}%</dd>
                    </div>
                  </dl>
                </div>
              )}

              <p className="staking-footer-note">
                Built for Devnet. When you&apos;re ready, switch network +
                endpoint for mainnet launch.
              </p>
            </aside>
          </section>
        </main>
      </div>

      {/* TOASTS */}
      <div className="staking-toast-container">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={
              "staking-toast " +
              (t.type === "success"
                ? "staking-toast-success"
                : "staking-toast-error")
            }
          >
            <div className="staking-toast-icon">
              {t.type === "success" ? "✓" : "!"}
            </div>
            <div className="staking-toast-message">{t.message}</div>
            <button
              type="button"
              className="staking-toast-close"
              onClick={() => hideToast(t.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, suffix }) {
  return (
    <div className="staking-stat-card">
      <p className="staking-stat-label">{label}</p>
      <p className="staking-stat-value">
        {value.toLocaleString(undefined, {
          maximumFractionDigits: 4,
        })}
        {suffix && <span className="staking-stat-suffix">{suffix}</span>}
      </p>
    </div>
  );
}
