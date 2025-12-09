// <entire file — copy/paste this over your StakingApp.jsx>

import React, {
  useEffect,
  useMemo,
  useState,
  useCallback,
} from "react";
import * as anchor from "@project-serum/anchor";
import {
  PublicKey,
  Connection,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import {
  ConnectionProvider,
  WalletProvider,
  useWallet,
} from "@solana/wallet-adapter-react";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import StakingDashboard from "./StakingDashboard";

// -----------------------------
// Configuration
// -----------------------------
const DEFAULT_RPC = "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey(
  "CRDwYUDJuhAjUNmxWwHnQD5rWbGnwvUjCNx5fqFYQjkn"
);
const POOL_PDA = new PublicKey("7JTJnze4Wru7byHHJofnCt5kash5PfDpZowisvNu8s9n");

// Test stake mint + vault (your HZK devnet test token)
const STAKE_MINT = new PublicKey(
  "Gy9zh44ttT7i5G9HPSzLKbweTWDb7EVrDfeEA4pmXpxK"
);
const POOL_VAULT = new PublicKey(
  "22v3QHqB2fq7biaWCqZbCFLRXpZbJ5sbbt7gA6AwtWUP"
);
const STAKE_MINT_DECIMALS = 9;

// NEW: reward vault owned by pool PDA
const REWARD_VAULT = new PublicKey(
  "CAMniLm1STTzRLTsFE3UiP4uPNbVGE1g3XDuMtzMBoUh"
);

// -----------------------------
// Load IDL
// -----------------------------
async function loadIdl() {
  const res = await fetch("/idl/hzk_staking.json");
  if (!res.ok) {
    throw new Error(
      "Failed to load IDL. Place your IDL at /idl/hzk_staking.json in the public folder."
    );
  }
  return await res.json();
}

// -----------------------------
// IDL sanitizer helpers
// -----------------------------
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj || {}));
}

function collectDefinedTypeNames(obj, set = new Set()) {
  if (!obj || typeof obj !== "object") return set;
  if (Array.isArray(obj)) {
    for (const v of obj) collectDefinedTypeNames(v, set);
    return set;
  }
  for (const [k, v] of Object.entries(obj)) {
    if (k === "defined" && typeof v === "string") {
      set.add(v);
    } else if (typeof v === "object" && v !== null) {
      collectDefinedTypeNames(v, set);
    }
  }
  return set;
}

function makePlaceholderType(name) {
  return {
    name,
    type: {
      kind: "struct",
      fields: [],
    },
  };
}

function normalizeFieldType(field) {
  if (!field) return field;
  if (typeof field.type === "string") {
    const s = field.type;
    const normalized = s === "pubkey" ? "publicKey" : s;
    field.type = { defined: normalized };
  } else if (typeof field.type === "number" || typeof field.type === "boolean") {
    field.type = { defined: String(field.type) };
  }
  return field;
}

function sanitizeIdlForAnchor(rawIdl) {
  const idl = deepClone(rawIdl || {});
  if (!Array.isArray(idl.accounts) && Array.isArray(idl.idlAccounts)) {
    idl.accounts = idl.idlAccounts;
  }
  if (!Array.isArray(idl.accounts)) idl.accounts = [];
  if (!Array.isArray(idl.types)) idl.types = [];

  idl.types = idl.types.map((t, idx) => {
    if (!t || typeof t !== "object")
      return makePlaceholderType(`__MALFORMED_TYPE_${idx}`);
    if (!t.name || typeof t.name !== "string")
      t.name = t.name || `__ANON_TYPE_${idx}`;
    if (!t.type || typeof t.type !== "object") {
      t.type = { kind: "struct", fields: [] };
    } else {
      if (!("kind" in t.type)) {
        if (Array.isArray(t.type.fields)) t.type.kind = "struct";
        else if (Array.isArray(t.type.variants)) t.type.kind = "enum";
        else t.type.kind = "struct";
      }
      if (t.type.kind === "struct" && !Array.isArray(t.type.fields))
        t.type.fields = [];
      if (t.type.kind === "enum" && !Array.isArray(t.type.variants))
        t.type.variants = [];
    }
    if (t.type.kind === "struct" && Array.isArray(t.type.fields)) {
      t.type.fields = t.type.fields.map((f) => normalizeFieldType(f));
    }
    return t;
  });

  idl.accounts = idl.accounts.map((acc, idx) => {
    if (!acc || typeof acc !== "object") {
      return {
        name: `__MALFORMED_ACCOUNT_${idx}`,
        type: { kind: "struct", fields: [] },
      };
    }
    if (!acc.name || typeof acc.name !== "string")
      acc.name = acc.name || `__ACCOUNT_${idx}`;
    if (typeof acc.type === "string") {
      acc.type = { defined: acc.type };
    } else if (!acc.type || typeof acc.type !== "object") {
      acc.type = { kind: "struct", fields: [] };
    } else {
      if (acc.type.kind === "struct" && Array.isArray(acc.type.fields)) {
        acc.type.fields = acc.type.fields.map((f) => normalizeFieldType(f));
      }
    }
    return acc;
  });

  // NOTE: we do NOT touch instr.args here, to keep encoding correct
  if (Array.isArray(idl.instructions)) {
    idl.instructions = idl.instructions.map((instr) => {
      if (!instr || typeof instr !== "object") return instr;
      if (Array.isArray(instr.accounts)) {
        instr.accounts = instr.accounts.map((a, idx) => {
          if (!a || typeof a !== "object")
            return { name: `__ACC_${idx}`, isMut: false, isSigner: false };
          if (!a.name) a.name = a.name || `account_${idx}`;
          return a;
        });
      }
      return instr;
    });
  }

  const referenced = collectDefinedTypeNames(idl);

  for (const t of idl.types) {
    if (t && t.type && t.type.kind === "struct" && Array.isArray(t.type.fields)) {
      for (const f of t.type.fields) {
        if (
          f &&
          f.type &&
          typeof f.type === "object" &&
          typeof f.type.defined === "string"
        ) {
          referenced.add(f.type.defined);
        }
      }
    }
  }

  const existingTypeNames = new Set(
    (idl.types || []).map((tt) => tt && tt.name).filter(Boolean)
  );
  for (const name of referenced) {
    if (!existingTypeNames.has(name)) {
      idl.types.push(makePlaceholderType(name));
      existingTypeNames.add(name);
    }
  }

  idl.types = idl.types.map((t, idx) => {
    if (!t || typeof t !== "object")
      return makePlaceholderType(`__FINAL_MALFORMED_${idx}`);
    if (!t.name || typeof t.name !== "string") t.name = `__FINAL_TYPE_${idx}`;
    if (!t.type || typeof t.type !== "object")
      t.type = { kind: "struct", fields: [] };
    if (!("kind" in t.type)) {
      if (Array.isArray(t.type.fields)) t.type.kind = "struct";
      else if (Array.isArray(t.type.variants)) t.type.kind = "enum";
      else t.type.kind = "struct";
    }
    if (t.type.kind === "struct" && !Array.isArray(t.type.fields))
      t.type.fields = [];
    if (t.type.kind === "enum" && !Array.isArray(t.type.variants))
      t.type.variants = [];
    if (t.type.kind === "struct") {
      t.type.fields = t.type.fields.map((f) => normalizeFieldType(f));
    }
    return t;
  });

  return idl;
}

function formatTokenAmount(raw, decimals = 9) {
  if (raw == null) return "0";
  const bn = new anchor.BN(raw.toString());
  const denom = new anchor.BN(10).pow(new anchor.BN(decimals));
  const whole = bn.div(denom).toString();
  const frac = bn.mod(denom).toString().padStart(decimals, "0");
  return `${whole}.${frac.slice(0, 4)}`;
}

// -----------------------------
// Staking App
// -----------------------------
function StakingAppInner() {
  const wallet = useWallet();
  const [connection] = useState(new Connection(DEFAULT_RPC, "confirmed"));
  const [program, setProgram] = useState(null);
  const [idl, setIdl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pool, setPool] = useState(null); // { raw, serializable }
  const [status, setStatus] = useState("");
  const [userState, setUserState] = useState(null); // { pubkey, parsed }
  const [walletHzkBalance, setWalletHzkBalance] = useState(0);

  const provider = useMemo(() => {
    if (!wallet || !wallet.publicKey) return null;
    return new anchor.AnchorProvider(
      connection,
      wallet,
      anchor.AnchorProvider.defaultOptions()
    );
  }, [wallet, connection]);

  const dummyWallet = useMemo(
    () => ({
      publicKey: PublicKey.default,
      signTransaction: async (tx) => tx,
      signAllTransactions: async (txs) => txs,
    }),
    []
  );

  // Load IDL + Program
  useEffect(() => {
    (async () => {
      try {
        const loaded = await loadIdl();
        const sanitized = sanitizeIdlForAnchor(loaded);
        setIdl(sanitized);

        console.log("IDL accounts (detailed):", sanitized.accounts);
        if (typeof window !== "undefined") window._debugIdl = sanitized;

        console.log("Loaded IDL (sanitized):", {
          address: sanitized.address,
          instructions: sanitized.instructions
            ? sanitized.instructions.map((i) => i.name)
            : [],
          accounts: sanitized.accounts
            ? sanitized.accounts.map((a) => a.name)
            : [],
        });

        const effectiveProvider =
          provider ||
          new anchor.AnchorProvider(
            connection,
            dummyWallet,
            anchor.AnchorProvider.defaultOptions()
          );
        const p = new anchor.Program(sanitized, PROGRAM_ID, effectiveProvider);
        setProgram(p);
        console.log("Program creation OK.");
      } catch (err) {
        console.error("Program/IDL load error:", err);
        setStatus(`Could not init program: ${err.message || err}`);
      }
    })();
  }, [connection, provider, dummyWallet]);

  function findProgramAccountKey(programObj, desired) {
    if (!programObj || !programObj.account) return null;
    const keys = Object.keys(programObj.account);
    let k = keys.find((x) => x === desired);
    if (k) return k;
    k = keys.find((x) => x.toLowerCase() === desired.toLowerCase());
    if (k) return k;
    const camel = desired.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
    k = keys.find(
      (x) => x === camel || x.toLowerCase() === camel.toLowerCase()
    );
    if (k) return k;
    return null;
  }

  // Helpers to read LE integers
  function readU64LE(buf, offset) {
    try {
      if (typeof buf.readBigUInt64LE === "function") {
        return BigInt(buf.readBigUInt64LE(offset));
      }
    } catch (e) {}
    let res = 0n;
    for (let i = 0; i < 8; i++) {
      res |= BigInt(buf[offset + i]) << BigInt(8 * i);
    }
    return res;
  }
  function readU128LE(buf, offset) {
    const low = readU64LE(buf, offset);
    const high = readU64LE(buf, offset + 8);
    return (high << 64n) | low;
  }

  // -----------------------------
  // Fetch pool (manual decode for Pool struct)
  // -----------------------------
  const fetchPool = async () => {
    if (!program) return;
    setLoading(true);
    try {
      const poolAccountKey =
        findProgramAccountKey(program, "pool") ||
        findProgramAccountKey(program, "Pool");
      if (!poolAccountKey) {
        throw new Error(
          "Pool account type not found in program.account (check IDL)"
        );
      }

      // Anchor decode (may be wrong due to IDL changes, but we still keep it for debug)
      const poolAccount = await program.account[poolAccountKey].fetch(POOL_PDA);
      if (typeof window !== "undefined") window._debugPool = poolAccount;
      console.log("RAW poolAccount:", poolAccount);

      // Raw bytes
      let info = null;
      try {
        info = await connection.getAccountInfo(POOL_PDA);
        if (typeof window !== "undefined") window._debugPoolInfo = info;
      } catch (rpcErr) {
        console.warn("getAccountInfo failed:", rpcErr);
      }

      const serializable = {};
      for (const k of Object.keys(poolAccount || {})) {
        const v = poolAccount[k];
        try {
          if (
            v &&
            typeof v === "object" &&
            typeof v.toString === "function" &&
            v.toString() !== "[object Object]"
          ) {
            serializable[k] = v.toString();
          } else if (v && v._bn) {
            serializable[k] = v._bn.toString();
          } else if (
            v instanceof Uint8Array ||
            (v && v.buffer && v.byteLength)
          ) {
            try {
              serializable[k] =
                Buffer.from(v).toString("hex").slice(0, 64) +
                (v.length > 32 ? "..." : "");
            } catch {
              serializable[k] = `Uint8Array(len=${v.length})`;
            }
          } else {
            serializable[k] = JSON.stringify(v);
          }
        } catch {
          serializable[k] = String(v);
        }
      }

      // Manual parse using actual struct layout
      if (info && info.data) {
        try {
          let bytes;
          if (Array.isArray(info.data) && typeof info.data[0] === "string") {
            const b64 = info.data[0];
            bytes = Uint8Array.from(Buffer.from(b64, "base64"));
          } else if (info.data instanceof Uint8Array) {
            bytes = info.data;
          } else if (
            typeof Buffer !== "undefined" &&
            info.data instanceof Buffer
          ) {
            bytes = Uint8Array.from(info.data);
          } else {
            try {
              bytes = Uint8Array.from(info.data);
            } catch {
              bytes = null;
            }
          }

          if (bytes) {
            const buf =
              typeof Buffer !== "undefined" ? Buffer.from(bytes) : bytes;
            const DISC = 8; // discriminator
            if (buf.length >= DISC + 32 * 3 + 8 + 8 + 16 + 8) {
              // Pubkeys
              const authorityBuf = buf.slice(DISC, DISC + 32);
              const rewardMintBuf = buf.slice(DISC + 32, DISC + 64);
              const rewardVaultBuf = buf.slice(DISC + 64, DISC + 96);

              let offset = DISC + 96;
              const rewardRatePerSecond = readU64LE(buf, offset);
              offset += 8;
              const totalStaked = readU64LE(buf, offset);
              offset += 8;
              const accRewardPerShare = readU128LE(buf, offset);
              offset += 16;

              // last_updated: i64 (we read as u64 then convert to Number)
              const lastUpdatedBig = readU64LE(buf, offset);
              const lastUpdatedNum = Number(lastUpdatedBig);

              const authorityPk = (() => {
                try {
                  return new PublicKey(authorityBuf).toString();
                } catch {
                  return null;
                }
              })();
              const rewardMintPk = (() => {
                try {
                  return new PublicKey(rewardMintBuf).toString();
                } catch {
                  return null;
                }
              })();
              const rewardVaultPk = (() => {
                try {
                  return new PublicKey(rewardVaultBuf).toString();
                } catch {
                  return null;
                }
              })();

              serializable._parsed = {
                authority: authorityPk,
                rewardMint: rewardMintPk,
                rewardVault: rewardVaultPk,
                rewardRatePerSecond: rewardRatePerSecond.toString(),
                totalStaked: totalStaked.toString(),
                accRewardPerShare: accRewardPerShare.toString(),
                lastUpdated: lastUpdatedNum.toString(),
                rawDataLen: buf.length,
              };
            } else {
              serializable._parseNote =
                "raw data length too small for Pool layout";
            }
          } else {
            serializable._parseNote =
              "could not normalize account.data to bytes";
          }
        } catch (parseErr) {
          serializable._parseError =
            (parseErr && parseErr.message) || String(parseErr);
          console.warn("Pool parse failed:", parseErr);
        }
      } else {
        serializable._parseNote = "no raw RPC account data available";
      }

      setPool({ raw: poolAccount, serializable });
      setStatus("Pool loaded");
    } catch (err) {
      console.error("fetchPool error", err);
      setStatus(`Failed to fetch pool: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (program) {
      setTimeout(() => {
        fetchPool();
      }, 300);
    }
  }, [program]);

  // -----------------------------
  // Fetch user state via raw bytes
  // -----------------------------
  const fetchUserInfo = async () => {
    if (!wallet.publicKey) return;
    try {
      const seeds = [
        Buffer.from("user"),
        wallet.publicKey.toBuffer(),
        POOL_PDA.toBuffer(),
      ];
      const [userPda] = await PublicKey.findProgramAddress(seeds, PROGRAM_ID);

      const info = await connection.getAccountInfo(userPda);
      if (!info || !info.data) {
        setUserState(null);
        return;
      }

      let bytes;
      if (Array.isArray(info.data) && typeof info.data[0] === "string") {
        const b64 = info.data[0];
        bytes = Uint8Array.from(Buffer.from(b64, "base64"));
      } else if (info.data instanceof Uint8Array) {
        bytes = info.data;
      } else if (
        typeof Buffer !== "undefined" &&
        info.data instanceof Buffer
      ) {
        bytes = Uint8Array.from(info.data);
      } else {
        try {
          bytes = Uint8Array.from(info.data);
        } catch {
          bytes = null;
        }
      }

      if (!bytes) {
        setUserState(null);
        return;
      }

      const buf =
        typeof Buffer !== "undefined" ? Buffer.from(bytes) : bytes;
      const DISC = 8; // discriminator

      if (buf.length < DISC + 32 + 8 + 16 + 8) {
        setUserState(null);
        return;
      }

      const ownerBuf = buf.slice(DISC, DISC + 32);
      const ownerPk = (() => {
        try {
          return new PublicKey(ownerBuf).toString();
        } catch {
          return null;
        }
      })();

      let offset = DISC + 32;
      const amount = readU64LE(buf, offset);
      offset += 8;
      const rewardDebt = readU128LE(buf, offset);
      offset += 16;
      const rewardsPending = readU64LE(buf, offset);

      const parsed = {
        owner: ownerPk,
        amount: amount.toString(),
        rewardDebt: rewardDebt.toString(),
        rewardsPending: rewardsPending.toString(),
        rawDataLen: buf.length,
      };

      setUserState({ pubkey: userPda, parsed });
    } catch (err) {
      console.warn("Could not fetch user info:", err);
      setUserState(null);
    }
  };

  useEffect(() => {
    if (program && wallet.publicKey) {
      setTimeout(() => {
        fetchUserInfo();
      }, 300);
    }
  }, [program, wallet.publicKey]);

  // -----------------------------
  // Fetch wallet HZK balance
  // -----------------------------
  const fetchWalletHzkBalance = useCallback(async () => {
    if (!wallet.publicKey) {
      setWalletHzkBalance(0);
      return;
    }
    try {
      const ata = await getAssociatedTokenAddress(
        STAKE_MINT,
        wallet.publicKey
      );
      const info = await connection.getTokenAccountBalance(ata);
      if (!info || !info.value) {
        setWalletHzkBalance(0);
        return;
      }
      const ui =
        typeof info.value.uiAmount === "number"
          ? info.value.uiAmount
          : Number(info.value.amount) /
            Math.pow(10, info.value.decimals || STAKE_MINT_DECIMALS);

      setWalletHzkBalance(ui || 0);
    } catch (err) {
      console.warn("Failed to fetch wallet HZK balance", err);
      setWalletHzkBalance(0);
    }
  }, [wallet.publicKey, connection]);

  useEffect(() => {
    fetchWalletHzkBalance();
  }, [fetchWalletHzkBalance]);

  // -----------------------------
  // sendTxWithWallet
  // -----------------------------
  const sendTxWithWallet = async (ixOrIxs, successMessage = "Done") => {
    if (!wallet.publicKey) {
      setStatus("Connect wallet");
      return;
    }
    const ixs = Array.isArray(ixOrIxs) ? ixOrIxs : [ixOrIxs];

    setStatus("Preparing transaction...");
    try {
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash("finalized");

      const tx = new Transaction({
        feePayer: wallet.publicKey,
        recentBlockhash: blockhash,
      });
      tx.add(...ixs);

      const signed = await wallet.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
      });

      setStatus(`Transaction sent: ${sig}. Waiting confirmation...`);
      await connection.confirmTransaction(
        { signature: sig, blockhash, lastValidBlockHeight },
        "confirmed"
      );

      setStatus(`${successMessage}: ${sig}`);
      await fetchPool();
      await fetchUserInfo();
      await fetchWalletHzkBalance();
      return sig;
    } catch (err) {
      console.error("sendTxWithWallet error:", err);
      setStatus(`Transaction failed: ${err.message || err}`);
      throw err;
    }
  };

  // -----------------------------
  // Manual instruction builders
  // -----------------------------
  const buildStakeIx = async (rawAmount, userStakingAta, userPda) => {
    const data = program.coder.instruction.encode("stake", {
      amount: rawAmount,
    });

    const keys = [
      { pubkey: POOL_PDA, isSigner: false, isWritable: true }, // pool
      { pubkey: userPda, isSigner: false, isWritable: true }, // user_state
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true }, // user
      { pubkey: userStakingAta, isSigner: false, isWritable: true }, // user_token_account
      { pubkey: POOL_VAULT, isSigner: false, isWritable: true }, // pool_vault
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // token_program
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
      {
        pubkey: anchor.web3.SYSVAR_RENT_PUBKEY,
        isSigner: false,
        isWritable: false,
      }, // rent
    ];

    return new TransactionInstruction({
      programId: PROGRAM_ID,
      keys,
      data,
    });
  };

  const buildUnstakeIx = async (rawAmount, userStakingAta, userPda) => {
    const data = program.coder.instruction.encode("unstake", {
      amount: rawAmount,
    });

    const keys = [
      { pubkey: POOL_PDA, isSigner: false, isWritable: true }, // pool
      { pubkey: userPda, isSigner: false, isWritable: true }, // user_state
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true }, // user
      { pubkey: userStakingAta, isSigner: false, isWritable: true }, // user_token_account
      { pubkey: POOL_VAULT, isSigner: false, isWritable: true }, // pool_vault
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // token_program
    ];

    return new TransactionInstruction({
      programId: PROGRAM_ID,
      keys,
      data,
    });
  };

  const buildClaimIx = async (userRewardAta, userPda, rewardVaultPk) => {
    const data = program.coder.instruction.encode("claim_rewards", {});

    const keys = [
      { pubkey: POOL_PDA, isSigner: false, isWritable: true }, // pool
      { pubkey: userPda, isSigner: false, isWritable: true }, // user_state
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true }, // user
      { pubkey: userRewardAta, isSigner: false, isWritable: true }, // user_reward_account
      { pubkey: rewardVaultPk, isSigner: false, isWritable: true }, // reward_vault
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // token_program
    ];

    return new TransactionInstruction({
      programId: PROGRAM_ID,
      keys,
      data,
    });
  };

  // -----------------------------
  // Stake / Unstake / Claim handlers
  // -----------------------------
  const stake = async (amount) => {
    if (!program || !wallet.publicKey) return setStatus("Connect wallet");
    if (!amount || amount <= 0)
      return setStatus("Enter a valid stake amount");
    if (!pool || !pool.raw) return setStatus("Pool not loaded");

    try {
      const userStakingAta = await getAssociatedTokenAddress(
        STAKE_MINT,
        wallet.publicKey
      );
      const rawAmount = new anchor.BN(
        Math.floor(amount * Math.pow(10, STAKE_MINT_DECIMALS)).toString()
      );
      const seeds = [
        Buffer.from("user"),
        wallet.publicKey.toBuffer(),
        POOL_PDA.toBuffer(),
      ];
      const [userPda] = await PublicKey.findProgramAddress(seeds, PROGRAM_ID);

      const ix = await buildStakeIx(rawAmount, userStakingAta, userPda);
      await sendTxWithWallet(ix, "Stake successful");
    } catch (err) {
      console.error("stake error", err);
      setStatus(`Stake failed: ${err.message || err}`);
    }
  };

  const unstake = async (amount) => {
    if (!program || !wallet.publicKey) return setStatus("Connect wallet");
    if (!amount || amount <= 0)
      return setStatus("Enter a valid unstake amount");
    if (!pool || !pool.raw) return setStatus("Pool not loaded");

    try {
      const userStakingAta = await getAssociatedTokenAddress(
        STAKE_MINT,
        wallet.publicKey
      );
      const rawAmount = new anchor.BN(
        Math.floor(amount * Math.pow(10, STAKE_MINT_DECIMALS)).toString()
      );
      const seeds = [
        Buffer.from("user"),
        wallet.publicKey.toBuffer(),
        POOL_PDA.toBuffer(),
      ];
      const [userPda] = await PublicKey.findProgramAddress(seeds, PROGRAM_ID);

      const ix = await buildUnstakeIx(rawAmount, userStakingAta, userPda);
      await sendTxWithWallet(ix, "Unstake successful");
    } catch (err) {
      console.error("unstake error", err);
      setStatus(`Unstake failed: ${err.message || err}`);
    }
  };

  const claim = async () => {
    if (!program || !wallet.publicKey) return setStatus("Connect wallet");
    if (!pool || !pool.raw) return setStatus("Pool not loaded");

    try {
      // rewardMint from pool
      let rewardMintStr = null;
      if (pool.serializable && pool.serializable._parsed) {
        rewardMintStr = pool.serializable._parsed.rewardMint;
      }
      if (!rewardMintStr && pool.serializable && pool.serializable.rewardMint) {
        rewardMintStr = pool.serializable.rewardMint;
      }
      if (
        !rewardMintStr &&
        pool.raw &&
        (pool.raw.rewardMint || pool.raw.reward_mint)
      ) {
        const v = pool.raw.rewardMint || pool.raw.reward_mint;
        rewardMintStr = v.toString ? v.toString() : v;
      }
      if (!rewardMintStr) return setStatus("Pool rewardMint not available");

      const rewardMint = new PublicKey(rewardMintStr);
      const userRewardAta = await getAssociatedTokenAddress(
        rewardMint,
        wallet.publicKey
      );

      // Use the new reward vault owned by the pool PDA
      const rewardVaultPk = REWARD_VAULT;

      const seeds = [
        Buffer.from("user"),
        wallet.publicKey.toBuffer(),
        POOL_PDA.toBuffer(),
      ];
      const [userPda] = await PublicKey.findProgramAddress(seeds, PROGRAM_ID);

      const ix = await buildClaimIx(userRewardAta, userPda, rewardVaultPk);
      await sendTxWithWallet(ix, "Claim successful");
    } catch (err) {
      console.error("claim error", err);
      setStatus(`Claim failed: ${err.message || err}`);
    }
  };

  // -----------------------------
  // Derived display values
  // -----------------------------
  const stakedBalanceUi =
    userState && userState.parsed
      ? Number(
          formatTokenAmount(
            userState.parsed.amount,
            STAKE_MINT_DECIMALS
          )
        )
      : 0;

  const pendingRewardsUi =
    userState && userState.parsed
      ? Number(
          formatTokenAmount(
            userState.parsed.rewardsPending,
            STAKE_MINT_DECIMALS
          )
        )
      : 0;

  // -----------------------------
  // UI – use the new dashboard
  // -----------------------------
  return (
    <StakingDashboard
      walletAddress={wallet.publicKey ? wallet.publicKey.toString() : null}
      network="devnet" // later change to "mainnet-beta" for mainnet
      hzkBalance={walletHzkBalance}
      stakedBalance={stakedBalanceUi}
      pendingRewards={pendingRewardsUi}
      apr={12}
      status={status}
      onStake={stake}
      onUnstake={unstake}
      onClaimRewards={claim}
      onDisconnect={wallet.disconnect}
    />
  );
}

// -----------------------------
// Wrapper
// -----------------------------
export default function StakingApp() {
  const network = WalletAdapterNetwork.Devnet;
  const endpoint = DEFAULT_RPC;
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect={false}>
        <WalletModalProvider>
          <StakingAppInner />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
