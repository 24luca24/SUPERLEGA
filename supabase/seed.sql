insert into public.seasons (id, name, active)
values ('11111111-1111-1111-1111-111111111111', 'Stagione Demo 2026', true)
on conflict (id) do nothing;

insert into public.players (id, animal, city, display_name, role, active, current_elo)
values
  ('00000000-0000-0000-0000-000000000001', 'Gorilla', 'Gorla', 'GORILLA DI GORLA', 'striker', true, 124.5),
  ('00000000-0000-0000-0000-000000000002', 'Gufo', 'Lecco', 'GUFO DI LECCO', 'defender', true, 119.7),
  ('00000000-0000-0000-0000-000000000003', 'Tigre', 'Catania', 'TIGRE DI CATANIA', 'striker', true, 112.2),
  ('00000000-0000-0000-0000-000000000004', 'Blatta', 'Milano', 'BLATTA DI MILANO', 'defender', true, 106.4)
on conflict (id) do nothing;
