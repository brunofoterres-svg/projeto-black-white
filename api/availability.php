<?php
require __DIR__.'/bootstrap.php';
if ($_SERVER['REQUEST_METHOD']!=='GET') fail('Método não permitido.',405);
$month=$_GET['month']??'';
if (!is_string($month) || !preg_match('/^\d{4}-(0[1-9]|1[0-2])$/',$month)) fail('Mês inválido.');
$start=new DateTimeImmutable($month.'-01'); $end=$start->modify('+1 month');
// Sem administrador configurado, não afirmar que um estoque vazio está disponível.
if (!(int)db()->query('SELECT COUNT(*) FROM users')->fetchColumn()) json_response(['days'=>new stdClass(),'blockedDates'=>[]]);
$minutes=turnaround_minutes();
$query=db()->prepare('SELECT b.start,b.end,b.kind,t.toy FROM bookings b JOIN booking_toys t ON t.booking_id=b.id WHERE b.status IN ("pending","confirmed") AND b.start < ? AND b.end > ?');
$query->execute([$end->format('Y-m-d\T00:00'),$start->modify('-'.$minutes.' minutes')->format('Y-m-d\TH:i')]);
$occupied=$query->fetchAll();
foreach ($occupied as &$item) $item['end']=effective_end($item['end'],$item['kind'],$minutes);
unset($item);
$days=[];
for ($day=$start;$day<$end;$day=$day->modify('+1 day')) {
    $key=$day->format('Y-m-d'); $days[$key]=array_fill_keys(array_keys(TOYS),'available');
    foreach ($occupied as $item) if ($item['start']<$day->modify('+1 day')->format('Y-m-d\T00:00') && $item['end']>$day->format('Y-m-d\T00:00')) $days[$key][$item['toy']]='unavailable';
}
json_response(['days'=>$days,'blockedDates'=>[], 'schedule'=>['month'=>$month,'turnaroundMinutes'=>$minutes,'busy'=>array_map(fn($r)=>['toy'=>$r['toy'],'start'=>$r['start'],'end'=>$r['end']],$occupied)]]);
