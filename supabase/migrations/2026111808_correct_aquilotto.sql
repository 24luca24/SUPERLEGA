-- Correct the existing player's name without changing IDs, credentials or Elo.
update public.users
set username = 'AQUILOTTO'
where username_norm = 'acquilotto';

update public.players
set animal = 'AQUILOTTO',
    display_name = replace(display_name, 'ACQUILOTTO', 'AQUILOTTO')
where upper(animal) = 'ACQUILOTTO';
