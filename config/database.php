<?php defined('SYSPATH') OR die('No direct access allowed.');

return array
    (
        'default' => array
        (
            'type'       => 'PostgreSQL',
            'connection' => array(
                'hostname'   => 'db',
                'database'   => 'maxtrackerdev',
                'username'   => 'postgres',
                'password'   => 'grespost',
                'persistent' => FALSE,
                'readonly'  => TRUE,
            ),
            'table_prefix' => '',
            'charset'      => 'utf8',
            'caching'      => FALSE,
        ),
    );
