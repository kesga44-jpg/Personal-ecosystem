-- Per gewone tabel: naam, aantal rijen en md5 van alle rijen als tekst, gesorteerd met collatie "C"
-- (onafhankelijk van de collatie van de database). Uitvoer per regel: schema.tabel|aantal|md5
select format(
         'select %L, count(*), md5(coalesce(string_agg(t::text, %L order by t::text collate "C"), %L)) from %I.%I t;',
         n.nspname || '.' || c.relname, chr(10), '', n.nspname, c.relname)
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r' and n.nspname <> 'information_schema' and n.nspname !~ '^pg_'
order by n.nspname, c.relname
\gexec
