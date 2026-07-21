revoke insert, update on profiles from authenticated, anon;
grant insert (id, nickname, country, region, language) on profiles to authenticated;
grant update (nickname, region, language) on profiles to authenticated;
