-- Reference data: the fixed concept areas and the event types.

begin;

insert into concept_area (slug, name, sort_order) values
  ('text-encodings',   'Text and encodings',        1),
  ('streams-io',       'Streams and I/O',           2),
  ('formats-parsing',  'Data formats and parsing',  3),
  ('state-storage',    'State and storage',         4),
  ('process-testing',  'Process and testing',       5),
  ('design-structure', 'Design and structure',      6),
  ('networking-http',  'Networking and HTTP',       7),
  ('concurrency',      'Concurrency',               8),
  ('apis-backends',    'APIs and backends',         9),
  ('data-stores',      'Data stores',              10);

insert into event_type (code, description) values
  ('enrolled',            'The learner started a project'),
  ('language_set',        'Language or framework chosen or changed (payload: language, framework)'),
  ('support_level_set',   'Support level chosen or changed (payload: level)'),
  ('repo_linked',         'A public repo link was added'),
  ('concept_seen',        'The learner said they read the concept brief'),
  ('concept_explained',   'A teach-back point tagged with the concept, or a gate question mapped to it, was met'),
  ('concept_applied',     'A repo check showed the concept in code'),
  ('step_started',        'The learner opened a step'),
  ('step_done',           'The Think task of a step passed'),
  ('step_parked',         'The learner parked a step'),
  ('help_offered',        'The app offered the next help level (payload: level)'),
  ('help_level_set',      'The learner accepted or changed the help level (payload: level)'),
  ('help_given',          'Help was given (payload: level)'),
  ('answer_graded',       'An answer was graded (payload: grade)'),
  ('grade_disputed',      'The learner disputed a grade'),
  ('gate_met',            'A teach-back or gate question was met'),
  ('milestone_understood','All steps are done and the teach-back is met'),
  ('milestone_built',     'A repo check covers the milestone'),
  ('repo_checked',        'The repo was read'),
  ('side_item_added',     'A side question, later topic or extra was added'),
  ('extra_done',          'An optional Extra step was completed'),
  ('reflection_submitted','The closing reflection was submitted'),
  ('project_understood',  'All milestones are understood and the reflection is in'),
  ('project_built',       'The repo covers all milestones');

commit;
