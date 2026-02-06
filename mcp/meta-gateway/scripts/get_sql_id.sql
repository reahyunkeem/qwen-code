select sql_id, sql_text, con_id
  from v_$sql
 where sql_text like 'select count(*) from t_sample%'
 order by last_active_time desc
 fetch first 5 rows only;
