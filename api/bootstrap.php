<?php
declare(strict_types=1);
date_default_timezone_set('America/Sao_Paulo');
ini_set('display_errors', '0');
set_exception_handler(function (Throwable $error): void {
    error_log($error->getMessage());
    json_response(['error'=>'Erro interno. Confira a configuração do servidor.'],500);
});
const TOYS = ['cama-p'=>'Cama elástica P','cama-m'=>'Cama elástica M','cama-g'=>'Cama elástica G','castelinho'=>'Castelinho inflável','piscina'=>'Piscina de bolinhas'];
const PRICES = ['cama-p'=>130,'cama-m'=>150,'cama-g'=>180,'castelinho'=>250,'piscina'=>130];
function db(): PDO {
    static $db;
    if ($db) return $db;
    $directory = getenv('BW_DATA_DIR') ?: dirname(__DIR__).'/.private';
    if (!is_dir($directory)) mkdir($directory, 0700, true);
    $db = new PDO('sqlite:'.$directory.'/reservas.sqlite', null, null, [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
    $db->exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');
    $db->exec('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS bookings (id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT "", address TEXT NOT NULL DEFAULT "", start TEXT NOT NULL, end TEXT NOT NULL, status TEXT NOT NULL, kind TEXT NOT NULL, notes TEXT NOT NULL DEFAULT "", fee REAL NOT NULL DEFAULT 0, created TEXT NOT NULL, updated TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS booking_toys (booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE, toy TEXT NOT NULL, PRIMARY KEY(booking_id,toy));
    CREATE INDEX IF NOT EXISTS booking_period ON bookings(start,end,status);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
    INSERT OR IGNORE INTO settings(key,value) VALUES ("turnaround_minutes",120);
    CREATE TABLE IF NOT EXISTS attempts (ip TEXT NOT NULL, at INTEGER NOT NULL);');
    @chmod($directory.'/reservas.sqlite',0600);
    return $db;
}
function json_response(array $data, int $code=200): never {
    http_response_code($code); header('Content-Type: application/json; charset=utf-8'); header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE); exit;
}
function fail(string $message, int $code=400): never { json_response(['error'=>$message],$code); }
function session_start_safe(): void {
    if (session_status() === PHP_SESSION_ACTIVE) return;
    ini_set('session.use_strict_mode','1');
    session_name('bw_admin');
    session_set_cookie_params(['httponly'=>true,'secure'=>!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS']!=='off','samesite'=>'Strict','path'=>'/']);
    session_start();
    if (isset($_SESSION['last']) && time()-$_SESSION['last']>7200) $_SESSION=[];
    $_SESSION['last']=time();
    $_SESSION['csrf'] ??= bin2hex(random_bytes(32));
}
function input(): array {
    $body=json_decode(file_get_contents('php://input'),true);
    if (!is_array($body)) fail('Dados inválidos.');
    return $body;
}
function csrf(): void {
    if (!hash_equals($_SESSION['csrf'], $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '')) fail('Sessão inválida. Atualize a página.',403);
}
function text_field(array $data,string $key,int $max=500): string {
    $value=$data[$key]??'';
    if (!is_string($value) || mb_strlen($value)>$max) fail('Campo inválido: '.$key);
    return trim($value);
}
function date_field(array $data,string $key): string {
    $value=text_field($data,$key,16);
    $date=DateTimeImmutable::createFromFormat('!Y-m-d\TH:i',$value);
    if (!$date || $date->format('Y-m-d\TH:i')!==$value) fail('Data ou horário inválido.');
    return $value;
}
function bookings(): array {
    $rows=db()->query('SELECT * FROM bookings ORDER BY start DESC')->fetchAll();
    $toys=db()->prepare('SELECT toy FROM booking_toys WHERE booking_id=? ORDER BY toy');
    foreach ($rows as &$row) {
        $toys->execute([$row['id']]); $row['toys']=$toys->fetchAll(PDO::FETCH_COLUMN);
        $row['total']=$row['kind']==='maintenance' ? 0 : array_sum(array_map(fn($id)=>PRICES[$id],$row['toys']))+(float)$row['fee'];
    }
    return $rows;
}

function turnaround_minutes(): int { return (int)db()->query("SELECT value FROM settings WHERE key='turnaround_minutes'")->fetchColumn(); }
function effective_end(string $end, string $kind, int $minutes): string {
    return (new DateTimeImmutable($end))->modify('+'.($kind==='rental' ? $minutes : 0).' minutes')->format('Y-m-d\TH:i');
}
function periods_conflict(array $a, array $b, int $minutes): bool {
    return $a['start'] < effective_end($b['end'],$b['kind'],$minutes)
        && $b['start'] < effective_end($a['end'],$a['kind'],$minutes);
}
