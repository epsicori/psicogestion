with ahora as (
  select g as t from generate_series(timestamptz '2026-10-07 00:00+02', timestamptz '2027-10-07 00:00+02', interval '10 minutes') g
),
rel(origen, k, l) as (values   -- k: cuánto antes de now() empieza; l: fin − inicio + descanso
  ('15.H', interval '48 hours', interval '60 minutes'),
  ('16.C5P1', interval '240 hours', interval '60 minutes'), ('16.C5P2', interval '72 hours', interval '60 minutes'),
  ('16.C5P3', interval '24 hours', interval '60 minutes'),  ('16.C7PAS', interval '168 hours', interval '60 minutes'),
  ('16.C7N3', interval '5 minutes', interval '60 minutes'),
  ('20.C1', interval '41 days 3 hours', interval '60 minutes'), ('20.C2', interval '42 days 3 hours', interval '60 minutes'),
  ('20.C4', interval '45 days 3 hours', interval '60 minutes'), ('20.C5', interval '44 days 3 hours', interval '60 minutes'),
  ('22.c2', interval '2 hours 20 minutes', interval '30 minutes'), ('22.c25', interval '25 hours 20 minutes', interval '30 minutes'),
  ('22.c26', interval '26 hours 20 minutes', interval '30 minutes'),
  ('22.73', interval '73 hours 20 minutes', interval '30 minutes'), ('22.74', interval '74 hours 20 minutes', interval '30 minutes'),
  ('22.75', interval '75 hours 20 minutes', interval '30 minutes'), ('22.76', interval '76 hours 20 minutes', interval '30 minutes'),
  ('22.77', interval '77 hours 20 minutes', interval '30 minutes'), ('22.78', interval '78 hours 20 minutes', interval '30 minutes'),
  ('22.79', interval '79 hours 20 minutes', interval '30 minutes'), ('22.80', interval '80 hours 20 minutes', interval '30 minutes'),
  ('22.81', interval '81 hours 20 minutes', interval '30 minutes'), ('22.86', interval '86 hours 20 minutes', interval '30 minutes'),
  ('22.88', interval '88 hours 20 minutes', interval '30 minutes'), ('22.90', interval '90 hours 20 minutes', interval '30 minutes'),
  ('22.92', interval '92 hours 20 minutes', interval '30 minutes')
),
fija(cita, d, h) as (values    -- citas del 23 que se insertan (las negativas no dejan fila)
  ('c_z HOY', -2, time '10:00'), ('c_z NUEVA', -5, time '12:00'),
  ('c_pasada HOY', -10, time '05:00'), ('c_pasada NUEVA', -9, time '05:00'),
  ('C3b', 0, time '03:00'), ('c_pp', -8, time '05:00'), ('c_y4', -40, time '05:00'),
  ('Ra', -20, time '05:00'), ('Rb', -20, time '07:00'), ('Rc', -20, time '09:00'), ('Rd', -20, time '11:00'), ('Rf', -20, time '13:00'),
  ('c_re', 3, time '05:00'), ('c_eb', 3, time '13:00'), ('C1b', 4, time '05:00'), ('C2b', 4, time '07:00'),
  ('C4b', 5, time '05:00'), ('c_w', 7, time '05:00'), ('c_c6b', 8, time '03:00'), ('c_j', 11, time '05:00')
)
select f.cita, r.origen, count(*) as arranques,
       min((a.t at time zone 'Europe/Madrid')::time) as desde, max((a.t at time zone 'Europe/Madrid')::time) as hasta
from ahora a cross join fija f cross join rel r
where tstzrange(a.t - r.k, a.t - r.k + r.l, '[)')
   && tstzrange((((a.t at time zone 'UTC')::date + f.d) + f.h) at time zone 'Europe/Madrid',
                (((a.t at time zone 'UTC')::date + f.d) + f.h) at time zone 'Europe/Madrid' + interval '30 minutes', '[)')
group by 1, 2 order by 1, 2;
