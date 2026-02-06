begin
  execute immediate 'drop table t_sample purge';
exception when others then null;
end;
/

create table t_sample (
  id number,
  category varchar2(20),
  created_at date
);

insert into t_sample
select level,
       case
         when mod(level,3)=0 then 'A'
         when mod(level,3)=1 then 'B'
         else 'C'
       end,
       sysdate - mod(level,30)
  from dual
connect by level <= 1000;

commit;

select count(*) from t_sample where category = 'A';
