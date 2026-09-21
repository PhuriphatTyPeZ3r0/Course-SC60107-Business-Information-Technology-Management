-- Action items can now be created/edited from the UI (previously read-only,
-- status-toggle only - see DESIGN_SYSTEM.md's "action item CRUD" section).
-- Assignee is deliberately a free-text column, not the existing
-- assignee_participant_id FK: participants are still raw "A"/"B" speaker
-- labels until the deferred participant-renaming work ships, and forcing
-- assignment through that FK today would mean assigning to "A"/"B".
ALTER TABLE action_item ADD COLUMN assignee_name TEXT;
