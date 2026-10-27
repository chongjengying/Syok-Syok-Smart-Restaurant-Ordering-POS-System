-- Kept as a forward-only checkpoint. Legacy kitchen overloads still use the
-- local role variable in their function bodies, so declaration cleanup is not
-- safe to perform through text substitution.
begin;
commit;
