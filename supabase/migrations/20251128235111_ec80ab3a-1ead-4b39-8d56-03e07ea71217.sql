-- Update the alerts status check constraint to include all valid statuses
ALTER TABLE alerts DROP CONSTRAINT IF EXISTS alerts_status_check;

ALTER TABLE alerts ADD CONSTRAINT alerts_status_check 
CHECK (status IN ('active', 'resolved', 'false_alarm', 'in_queue', 'unsolved'));