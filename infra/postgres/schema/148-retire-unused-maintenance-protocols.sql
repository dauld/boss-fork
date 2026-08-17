-- 148-retire-unused-maintenance-protocols.sql — retire three protocols
-- that have never admitted a packet.
--
-- Origin (David, 2026-08-17): "retire the 8 never-used protocols",
-- after a census measured which ones had drifted out of use.
--
-- THE MEASUREMENT. Across all 5,964 packets and 46 active workflows,
-- eight protocols had ZERO packets, ever:
--
--   batch-qc-hold, brewery-hire, brewery-terminate, escalation,
--   regenerate-deployment          -- data-seeded, retired through the API
--   maintenance-backup, maintenance-audit-integrity,
--   maintenance-ledger-replay      -- THIS FILE
--
-- WHY THESE THREE NEED A MIGRATION AND THE OTHER FIVE DID NOT. The
-- first five are supplied by data seeds (tenant `seeds/workflows.toml`
-- and `infra/platform/workflows.toml`, whose loader inserts only what
-- is missing), so `POST /api/workflows/{kind}/retire` sticks: nothing
-- puts them back. These three were literals in `platform_workflows()`,
-- and `bootstrap_reconcile` republishes any code-defined kind whose
-- row has drifted from the code — so an API retire on them would be
-- silently undone on the next boot. That is finding 68331085, and it
-- is exactly why this is a code removal PLUS a data retire rather than
-- one API call.
--
-- The two halves have to travel together. Removing the specs alone
-- leaves three active rows nothing reseeds; retiring the rows alone
-- gets reverted by the next reconcile. Landing them in one car makes
-- the deploy atomic.
--
-- WHAT RETIREMENT DOES, and why it is safe with no ceremony: admission
-- resolves a kind through `get_active` (`WHERE status = 'active'`), so
-- a retired kind refuses NEW packets — verified live on 2026-08-17,
-- creating an `escalation` job after retiring it returns
-- `400 unknown or inactive job kind`. In-flight packets are unaffected
-- because they resolve by the version pinned at admission via
-- `get_version`. Here there are no in-flight packets to protect: the
-- whole point is that these three never had any.
--
-- REVERSIBLE. Publishing the kind again restores it; nothing is
-- deleted and the rows keep their history.
UPDATE workflows
   SET status = 'retired'
 WHERE kind IN (
         'maintenance-backup',
         'maintenance-audit-integrity',
         'maintenance-ledger-replay'
       )
   AND status = 'active';
