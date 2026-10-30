-- Each card appears once per enrollment. syncCards runs after turns, after reviews and on every page poll, so two runs
-- can race; the database settles it. Older duplicates are removed first, keeping the earliest.
delete from message m
 using message d
 where m.role = 'card' and d.role = 'card'
   and m.enrollment_id = d.enrollment_id
   and m.meta -> 'card' = d.meta -> 'card'
   and m.id > d.id;

create unique index message_card_once_idx on message (enrollment_id, (meta -> 'card')) where role = 'card';
