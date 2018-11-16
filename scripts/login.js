$(document).ready(function(){
    $('.login-form').validate({
        errorElement: 'span', //default input error message container
        errorClass: 'help-block', // default input error message class
        focusInvalid: false, // do not focus the last invalid input
        rules: {
            username: {
                required: true
            },
            password: {
                required: true
            },
            remember: {
                required: false
            }
        },

        messages: {
            username: {
                required: "Dirección de correo electrónico es requerido"
            },
            password: {
                required: "La contraseña es requerida"
            }
        },

        invalidHandler: function (event, validator) { //display error alert on form submit
            $('.alert-danger', $('.login-form')).show();
        },

        highlight: function (element) { // hightlight error inputs
            $(element)
                .closest('.form-group').addClass('has-error'); // set error class to the control group
        },

        success: function (label) {
            label.closest('.form-group').removeClass('has-error');
            label.remove();
        },

        errorPlacement: function (error, element) {
            error.insertAfter(element.closest('.input-icon'));
        },

        submitHandler: function (form) {
            form.submit(); // form validation success, call ajax form submit
        }
    });

    $('.login-form input').on('keypress', function (e) {
        if (e.which == 13) {
            if ($('.login-form').validate().form()) {
                $('#btnSubmit').trigger('click');
            }
            return false;
        }
    });
    $('.forget-form').validate({
        errorElement: 'span', //default input error message container
        errorClass: 'help-block', // default input error message class
        focusInvalid: false, // do not focus the last invalid input
        ignore: "",
        rules: {
            email: {
                required: true,
                email: true
            }
        },

        messages: {
            email: {
                required: "Debe ingresar su dirección de correo electrónico",
                email: "Por favor ingrese una dirección de correo electrónico válido"
            }
        },

        invalidHandler: function (event, validator) { //display error alert on form submit

        },

        highlight: function (element) { // hightlight error inputs
            $(element)
                .closest('.form-group').addClass('has-error'); // set error class to the control group
        },

        success: function (label) {
            label.closest('.form-group').removeClass('has-error');
            label.remove();
        },

        errorPlacement: function (error, element) {
            error.insertAfter(element.closest('.input-icon'));
        },

        submitHandler: function (form) {
            form.submit();
        }
    });

    $('.forget-form input').on('keypress', function (e) {
        if (e.which == 13) {
            if ($('.forget-form').validate().form()) {
                $('.forget-form').submit();
            }
            return false;
        }
    });

    $('#forget-password').on('click', function () {
        $('.login-form').hide();
        $('.forget-form').show();
    });

    $('#back-btn').on('click', function () {
        $('.login-form').show();
        $('.forget-form').hide();
    });

    $('#username').focus();

});
