-- PRD R1.1: persist the failing gate name for every dispatch decision so the
-- funnel (signals in -> rejects per gate -> orders out) is auditable.
ALTER TABLE `ml_inferences` ADD COLUMN `gate_result` text;
