<?php
// Roteador apenas para desenvolvimento: php -S 127.0.0.1:8080 router.php
$path=rawurldecode(parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH));
if (preg_match('~(^|/)[.]|bf011207|\.(sqlite|log)(-|$)~',$path)) { http_response_code(404); exit; }
$file=realpath(__DIR__.$path);
if ($file && !str_starts_with($file,__DIR__.DIRECTORY_SEPARATOR)) { http_response_code(404); exit; }
if ($path==='/admin') { header('Location: /admin/'); return true; }
if ($path==='/admin/') { require __DIR__.'/admin/index.php'; return true; }
return false;
