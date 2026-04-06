-- توحيد عرض أسماء محافظ الدفع/الاستلام في الواجهة (محفظة إلكترونية بدل فودافون كاش)
UPDATE payment_wallets
SET name = CASE payment_channel
  WHEN 'vodafone_cash' THEN 'محفظة إلكترونية — ' || phone_digits
  WHEN 'instapay' THEN 'إنستاباي — ' || phone_digits
  ELSE name
END
WHERE payment_channel IN ('vodafone_cash', 'instapay');
