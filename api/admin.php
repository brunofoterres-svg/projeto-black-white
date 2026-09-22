<?php
require __DIR__.'/bootstrap.php';
session_start_safe();
$action=$_GET['action']??'session';
if ($action==='session' && $_SERVER['REQUEST_METHOD']==='GET') json_response(['authenticated'=>isset($_SESSION['user']),'csrf'=>$_SESSION['csrf'],'setupRequired'=>!(int)db()->query('SELECT COUNT(*) FROM users')->fetchColumn()]);
if ($_SERVER['REQUEST_METHOD']==='POST') csrf();
if (in_array($action,['setup','login'],true) && $_SERVER['REQUEST_METHOD']==='POST') {
    $data=input(); $username=text_field($data,'username',80); $password=$data['password']??'';
    if (!$username || !is_string($password) || strlen($password)>1024) fail('Credenciais inválidas.');
    if ($action==='setup') {
        if (!in_array($_SERVER['REMOTE_ADDR']??'',['127.0.0.1','::1'],true)) fail('Crie o primeiro acesso pelo computador local.',403);
        if (strlen($password)<12) fail('Use uma senha com pelo menos 12 caracteres.');
        db()->exec('BEGIN IMMEDIATE');
        if ((int)db()->query('SELECT COUNT(*) FROM users')->fetchColumn()) { db()->exec('ROLLBACK'); fail('O administrador já foi configurado.',403); }
        db()->prepare('INSERT INTO users(username,password) VALUES(?,?)')->execute([$username,password_hash($password,PASSWORD_DEFAULT)]);
        $id=(int)db()->lastInsertId(); db()->exec('COMMIT');
    } else {
        $ip=$_SERVER['REMOTE_ADDR']??'unknown';
        db()->prepare('DELETE FROM attempts WHERE at < ?')->execute([time()-900]);
        $q=db()->prepare('SELECT COUNT(*) FROM attempts WHERE ip=?'); $q->execute([$ip]);
        if ($q->fetchColumn()>=5) fail('Muitas tentativas. Aguarde 15 minutos.',429);
        $q=db()->prepare('SELECT * FROM users WHERE username=?'); $q->execute([$username]); $user=$q->fetch();
        if (!$user || !password_verify($password,$user['password'])) {
            db()->prepare('INSERT INTO attempts(ip,at) VALUES(?,?)')->execute([$ip,time()]); fail('Usuário ou senha incorretos.',401);
        }
        db()->prepare('DELETE FROM attempts WHERE ip=?')->execute([$ip]); $id=$user['id'];
    }
    session_regenerate_id(true); $_SESSION['user']=$id; $_SESSION['csrf']=bin2hex(random_bytes(32));
    json_response(['ok'=>true,'csrf'=>$_SESSION['csrf']]);
}
if (!isset($_SESSION['user'])) fail('Entre no painel para continuar.',401);
if ($action==='list' && $_SERVER['REQUEST_METHOD']==='GET') json_response(['bookings'=>bookings(),'toys'=>TOYS,'turnaroundMinutes'=>turnaround_minutes()]);
if ($_SERVER['REQUEST_METHOD']!=='POST') fail('Método não permitido.',405);
if ($action==='logout') { $_SESSION=[]; session_destroy(); json_response(['ok'=>true]); }
if ($action==='settings') {
    $minutes=filter_var(input()['turnaroundMinutes']??null,FILTER_VALIDATE_INT);
    if ($minutes===false || $minutes===null || $minutes<0 || $minutes>1440) fail('Informe uma margem entre 0 e 1440 minutos.');
    db()->exec('BEGIN IMMEDIATE');
    $active=array_values(array_filter(bookings(),fn($r)=>$r['status']!=='cancelled'));
    for ($i=0;$i<count($active);$i++) for ($j=$i+1;$j<count($active);$j++) {
        if (array_intersect($active[$i]['toys'],$active[$j]['toys']) && periods_conflict($active[$i],$active[$j],$minutes)) {
            db()->exec('ROLLBACK'); fail('A margem criaria um conflito entre os registros #'.$active[$i]['id'].' e #'.$active[$j]['id'].'. Ajuste essas reservas primeiro.',409);
        }
    }
    db()->prepare("UPDATE settings SET value=? WHERE key='turnaround_minutes'")->execute([$minutes]);
    db()->exec('COMMIT'); json_response(['ok'=>true]);
}
if ($action!=='save') fail('Ação inválida.',404);
$data=input();
$id=filter_var($data['id']??0,FILTER_VALIDATE_INT); if ($id===false || $id<0) fail('Reserva inválida.');
$kind=text_field($data,'kind',20); $status=text_field($data,'status',20);
if (!in_array($kind,['rental','maintenance'],true) || !in_array($status,['pending','confirmed','cancelled'],true)) fail('Tipo ou situação inválida.');
$name=text_field($data,'name',120); if (!$name) fail('Informe o nome ou motivo da manutenção.');
$phone=text_field($data,'phone',40); $address=text_field($data,'address'); $notes=text_field($data,'notes',2000);
$start=date_field($data,'start'); $end=date_field($data,'end'); if ($end<=$start) fail('A retirada deve ser posterior à instalação.');
$toys=$data['toys']??[];
if (!is_array($toys) || !$toys || count($toys)>5) fail('Selecione pelo menos um brinquedo.');
foreach ($toys as $toy) if (!is_string($toy) || !isset(TOYS[$toy])) fail('Brinquedo inválido.');
$toys=array_values(array_unique($toys));
$fee=filter_var($data['fee']??0,FILTER_VALIDATE_FLOAT); if ($fee===false || $fee<0 || $fee>100000) fail('Taxa inválida.');
if ($kind==='maintenance') $fee=0;
$db=db(); $db->exec('BEGIN IMMEDIATE');
try {
    if ($id) { $q=$db->prepare('SELECT id FROM bookings WHERE id=?'); $q->execute([$id]); if (!$q->fetchColumn()) { $db->exec('ROLLBACK'); fail('Reserva não encontrada.',404); } }
    if ($status!=='cancelled') {
        $q=$db->prepare('SELECT b.id,b.start,b.end,b.kind,t.toy FROM bookings b JOIN booking_toys t ON b.id=t.booking_id WHERE b.id<>? AND b.status IN ("pending","confirmed") AND t.toy IN ('.implode(',',array_fill(0,count($toys),'?')).')');
        $q->execute(array_merge([$id],$toys));
        $minutes=turnaround_minutes();
        foreach ($q->fetchAll() as $existing) if (periods_conflict(['start'=>$start,'end'=>$end,'kind'=>$kind],$existing,$minutes)) {
            $db->exec('ROLLBACK'); fail(TOYS[$existing['toy']].' tem conflito com o registro #'.$existing['id'].' considerando '.$minutes.' minutos para desmontagem e transporte.',409);
        }
    }
    $now=date(DATE_ATOM); $values=[$name,$phone,$address,$start,$end,$status,$kind,$notes,$fee,$now];
    if ($id) $db->prepare('UPDATE bookings SET name=?,phone=?,address=?,start=?,end=?,status=?,kind=?,notes=?,fee=?,updated=? WHERE id=?')->execute([...$values,$id]);
    else { $db->prepare('INSERT INTO bookings(name,phone,address,start,end,status,kind,notes,fee,updated,created) VALUES(?,?,?,?,?,?,?,?,?,?,?)')->execute([...$values,$now]); $id=(int)$db->lastInsertId(); }
    $db->prepare('DELETE FROM booking_toys WHERE booking_id=?')->execute([$id]);
    $q=$db->prepare('INSERT INTO booking_toys(booking_id,toy) VALUES(?,?)'); foreach ($toys as $toy) $q->execute([$id,$toy]);
    $db->exec('COMMIT'); json_response(['ok'=>true,'id'=>$id]);
} catch (Throwable $e) { $db->exec('ROLLBACK'); error_log($e->getMessage()); fail('Não foi possível salvar. Tente novamente.',500); }
