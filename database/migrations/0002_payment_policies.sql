-- A student keeps one entitlement, while each verified payment gets its own record.
ALTER TABLE courses
  ADD COLUMN payment_mode text NOT NULL DEFAULT 'single'
    CHECK (payment_mode IN ('single', 'repeat', 'installments')),
  ADD COLUMN installment_count integer NOT NULL DEFAULT 0
    CHECK (installment_count BETWEEN 0 AND 12);

ALTER TABLE enrolments
  DROP CONSTRAINT enrolments_course_id_student_id_key,
  ADD COLUMN payment_number integer NOT NULL DEFAULT 1
    CHECK (payment_number > 0),
  ADD CONSTRAINT enrolments_course_student_payment_key UNIQUE (course_id, student_id, payment_number);

ALTER TABLE courses
  ADD CONSTRAINT courses_installment_policy_check
  CHECK (payment_mode <> 'installments' OR installment_count BETWEEN 2 AND 12);